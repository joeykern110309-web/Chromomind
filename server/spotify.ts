import type { Request, Response } from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-recently-played",
  "user-top-read",
].join(" ");

const CONFIG_FILE = join(process.cwd(), ".spotify-config.json");

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
}

interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function loadConfig(): SpotifyConfig {
  if (existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      return {
        clientId: saved.clientId || process.env.SPOTIFY_CLIENT_ID || "",
        clientSecret: saved.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || "",
        redirectUri: saved.redirectUri || process.env.SPOTIFY_REDIRECT_URI || "",
        refreshToken: saved.refreshToken,
      };
    } catch { /* fall through */ }
  }
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || "",
  };
}

function saveConfig(cfg: SpotifyConfig) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist Spotify config:", e);
  }
}

let config: SpotifyConfig = loadConfig();
let tokenStore: TokenStore | null = null;

async function autoRestoreSession() {
  if (!config.refreshToken) return;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }),
    });
    if (!res.ok) {
      console.log("[Spotify] Auto-restore failed, clearing saved token");
      config.refreshToken = undefined;
      saveConfig(config);
      return;
    }
    const data = await res.json();
    tokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || config.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    if (data.refresh_token) {
      config.refreshToken = data.refresh_token;
      saveConfig(config);
    }
    console.log("[Spotify] Session auto-restored from saved refresh token");
  } catch (e) {
    console.error("[Spotify] Auto-restore exception:", e);
  }
}

autoRestoreSession();

// ── Public helpers ─────────────────────────────────────────────────────────────

export function getRefreshToken(): string | null {
  return tokenStore?.refreshToken ?? config.refreshToken ?? null;
}

/** Restore a Spotify session from a specific refresh token (used when a user logs in). */
export async function restoreFromRefreshToken(refreshToken: string): Promise<boolean> {
  if (!config.clientId || !config.clientSecret) return false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    if (data.refresh_token) {
      config.refreshToken = data.refresh_token;
      saveConfig(config);
    }
    console.log("[Spotify] Session restored from user account token");
    return true;
  } catch {
    return false;
  }
}

export function getConfig() {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret ? "••••••••" : "",
    redirectUri: config.redirectUri,
    hasSecret: !!config.clientSecret,
  };
}

export function updateConfig(updates: Partial<SpotifyConfig>) {
  config = { ...config, ...updates };
  saveConfig(config);
  tokenStore = null;
}

let sdkDeviceId: string | null = null;

export function setSdkDeviceId(id: string | null) {
  sdkDeviceId = id;
  console.log("[Spotify] SDK device_id set:", id);
}

export function getSdkDeviceId(): string | null {
  return sdkDeviceId;
}

export async function getAccessTokenForSdk(): Promise<string | null> {
  return getAccessToken();
}

export function isConnected(): boolean {
  return tokenStore !== null;
}

function isConfigured(): boolean {
  return !!(config.clientId && config.clientSecret && config.redirectUri);
}

async function refreshAccessToken(): Promise<boolean> {
  if (!tokenStore) return false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenStore.refreshToken,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokenStore.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return true;
  } catch {
    return false;
  }
}

async function getAccessToken(): Promise<string | null> {
  if (!tokenStore) return null;
  if (Date.now() >= tokenStore.expiresAt - 60000) {
    const ok = await refreshAccessToken();
    if (!ok) return null;
  }
  return tokenStore.accessToken;
}

async function spotifyFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export function handleLogin(_req: Request, res: Response) {
  if (!isConfigured()) return res.redirect("/?spotify=not-configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}

export async function handleCallback(
  req: Request,
  res: Response,
  onToken?: (refreshToken: string) => void
) {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) return res.redirect("/?spotify=error");
  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      }),
    });
    if (!tokenRes.ok) return res.redirect("/?spotify=error");
    const data = await tokenRes.json();
    tokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    config.refreshToken = data.refresh_token;
    saveConfig(config);
    if (onToken) onToken(data.refresh_token);
    res.redirect("/?spotify=connected");
  } catch {
    res.redirect("/?spotify=error");
  }
}

export async function getNowPlaying(): Promise<object | null> {
  const res = await spotifyFetch("/me/player/currently-playing");
  if (!res || res.status === 204) return null;
  if (!res.ok) return null;
  try {
    const data = await res.json();
    if (!data || !data.item) return null;
    const track = data.item;
    return {
      isPlaying: data.is_playing,
      trackName: track.name,
      artistName: track.artists.map((a: { name: string }) => a.name).join(", "),
      albumName: track.album.name,
      albumArt: track.album.images?.[0]?.url || null,
      duration: track.duration_ms,
      progress: data.progress_ms,
      trackUrl: track.external_urls?.spotify || null,
    };
  } catch {
    return null;
  }
}

async function getActiveDeviceId(): Promise<string | null> {
  const res = await spotifyFetch("/me/player/devices");
  if (!res || !res.ok) return null;
  const data = await res.json();
  const devices: Array<{ id: string; is_active: boolean; type: string; name: string }> = data.devices || [];
  if (!devices.length) return null;
  const active = devices.find(d => d.is_active) || devices[0];
  return active.id;
}

async function ensureActiveDevice(): Promise<string | null> {
  const deviceId = await getActiveDeviceId();
  if (!deviceId) return null;
  await spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: true }),
  });
  await new Promise(r => setTimeout(r, 800));
  return deviceId;
}

export async function playerAction(action: string): Promise<boolean> {
  let path = "";
  let method = "PUT";
  switch (action) {
    case "play":      path = "/me/player/play";     method = "PUT";  break;
    case "pause":     path = "/me/player/pause";    method = "PUT";  break;
    case "next":      path = "/me/player/next";     method = "POST"; break;
    case "previous":  path = "/me/player/previous"; method = "POST"; break;
    default: return false;
  }
  const preferredDevice = sdkDeviceId || await getActiveDeviceId();
  const targetPath = preferredDevice ? `${path}?device_id=${preferredDevice}` : path;
  const res = await spotifyFetch(targetPath, { method });
  if (res && !res.ok && res.status !== 204) {
    try { console.error("[Spotify] playerAction error:", await res.text()); } catch { /* ignore */ }
  }
  const ok = res !== null && (res.ok || res.status === 204);
  if (ok && (action === "next" || action === "previous")) {
    await new Promise(r => setTimeout(r, 800));
    const resumePath = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    await spotifyFetch(resumePath, { method: "PUT" });
  }
  return ok;
}

export async function searchAndPlay(query: string): Promise<{ success: boolean; trackName?: string; artistName?: string; error?: string }> {
  try {
    const searchRes = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=5`);
    if (!searchRes || !searchRes.ok) return { success: false, error: "Search failed" };
    const data = await searchRes.json();
    const track = data.tracks?.items?.[0];
    if (!track) return { success: false, error: "No tracks found for: " + query };

    console.log("[Spotify] Found track:", track.name, "by", track.artists[0]?.name);

    const preferredDevice = sdkDeviceId || await getActiveDeviceId();
    const playPath = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    const playRes = await spotifyFetch(playPath, {
      method: "PUT",
      body: JSON.stringify({ uris: [track.uri] }),
    });

    if (!playRes || (!playRes.ok && playRes.status !== 204)) {
      let errDetail = `HTTP ${playRes?.status}`;
      try {
        const body = await playRes?.text();
        if (body) {
          const parsed = JSON.parse(body);
          errDetail = parsed?.error?.message || errDetail;
        }
      } catch { /* ignore */ }
      if (playRes?.status === 403) return { success: false, error: "Spotify Premium is required to control playback." };
      return { success: false, error: errDetail };
    }

    await new Promise(r => setTimeout(r, 600));
    const resumePath = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    await spotifyFetch(resumePath, { method: "PUT" });

    return { success: true, trackName: track.name, artistName: track.artists.map((a: { name: string }) => a.name).join(", ") };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getStatus() {
  if (!tokenStore) return { connected: false, nowPlaying: null, configured: isConfigured() };
  const nowPlaying = await getNowPlaying();
  return { connected: true, nowPlaying, configured: true };
}

export function disconnect() {
  tokenStore = null;
  config.refreshToken = undefined;
  saveConfig(config);
}

// ── New: artist / playlist / queue helpers ────────────────────────────────────

/** Search tracks without playing — returns results for queue/display use */
export async function searchTracks(query: string, limit = 5): Promise<Array<{ uri: string; name: string; artistName: string }> | null> {
  try {
    const res = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
    if (!res?.ok) return null;
    const data = await res.json();
    return (data.tracks?.items || []).map((t: any) => ({
      uri: t.uri,
      name: t.name,
      artistName: t.artists.map((a: any) => a.name).join(", "),
    }));
  } catch { return null; }
}

/** Get an artist's top tracks (up to 5). Returns null if artist not found. */
export async function getArtistTopTracks(artistName: string): Promise<Array<{ uri: string; name: string; artistName: string }> | null> {
  try {
    const searchRes = await spotifyFetch(`/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`);
    if (!searchRes?.ok) return null;
    const searchData = await searchRes.json();
    const artist = searchData.artists?.items?.[0];
    if (!artist) return null;

    const topRes = await spotifyFetch(`/artists/${artist.id}/top-tracks?market=from_token`);
    if (!topRes?.ok) return null;
    const topData = await topRes.json();

    return (topData.tracks || []).slice(0, 5).map((t: any) => ({
      uri: t.uri,
      name: t.name,
      artistName: artist.name,
    }));
  } catch { return null; }
}

/** Get the user's saved playlists (up to 20). */
export async function getUserPlaylists(): Promise<Array<{ id: string; name: string; uri: string; trackCount: number }> | null> {
  try {
    const res = await spotifyFetch("/me/playlists?limit=20");
    if (!res?.ok) return null;
    const data = await res.json();
    return (data.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      uri: p.uri,
      trackCount: p.tracks?.total ?? 0,
    }));
  } catch { return null; }
}

/** Play a Spotify context URI (playlist, album, artist). */
export async function playContext(contextUri: string): Promise<boolean> {
  try {
    const preferredDevice = sdkDeviceId || await getActiveDeviceId();
    const path = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    const res = await spotifyFetch(path, {
      method: "PUT",
      body: JSON.stringify({ context_uri: contextUri }),
    });
    if (res && (res.ok || res.status === 204)) {
      await new Promise(r => setTimeout(r, 600));
      const resumePath = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
      await spotifyFetch(resumePath, { method: "PUT" });
      return true;
    }
    return false;
  } catch { return false; }
}

/** Add a track URI to the playback queue. */
export async function addToQueue(trackUri: string): Promise<boolean> {
  try {
    const preferredDevice = sdkDeviceId || await getActiveDeviceId();
    const deviceParam = preferredDevice ? `&device_id=${preferredDevice}` : "";
    const res = await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(trackUri)}${deviceParam}`, { method: "POST" });
    return !!(res && (res.ok || res.status === 204));
  } catch { return false; }
}

/** Get the current playback queue (up to 8 upcoming tracks). */
export async function getQueue(): Promise<{ current: { name: string; artistName: string } | null; upcoming: Array<{ name: string; artistName: string }> } | null> {
  try {
    const res = await spotifyFetch("/me/player/queue");
    if (!res?.ok) return null;
    const data = await res.json();
    return {
      current: data.currently_playing ? {
        name: data.currently_playing.name,
        artistName: data.currently_playing.artists?.map((a: any) => a.name).join(", ") ?? "",
      } : null,
      upcoming: (data.queue || []).slice(0, 8).map((t: any) => ({
        name: t.name,
        artistName: t.artists?.map((a: any) => a.name).join(", ") ?? "",
      })),
    };
  } catch { return null; }
}
