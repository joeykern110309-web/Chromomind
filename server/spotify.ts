import type { Request, Response as ExpressResponse } from "express";
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
  "playlist-read-private",
  "playlist-read-collaborative",
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
  const method = (options.method || "GET").toUpperCase();
  const url = `https://api.spotify.com/v1${path}`;
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) {
    (headers as Record<string,string>)["Content-Type"] = "application/json";
  }
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = options.body;
  return fetch(url, init);
}

export function handleLogin(_req: Request, res: ExpressResponse) {
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
  res: ExpressResponse,
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

// ── Track / artist / playlist / queue helpers ─────────────────────────────────

export interface SpotifyTrack {
  uri: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  trackCount: number;
  imageUrl: string | null;
}

/** Search tracks without playing — returns results for queue/display use */
export async function searchTracks(query: string, limit = 5): Promise<SpotifyTrack[] | null> {
  try {
    const res = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
    if (!res?.ok) return null;
    const data = await res.json();
    return (data.tracks?.items || []).map((t: any) => ({
      uri: t.uri,
      name: t.name,
      artistName: t.artists.map((a: any) => a.name).join(", "),
      imageUrl: t.album?.images?.[0]?.url ?? null,
    }));
  } catch { return null; }
}

/** Get an artist's top tracks (up to 10).
 *  Strategy:
 *  1. Find artist via search to get their canonical name + ID
 *  2. Try /artists/{id}/top-tracks (may 403 in dev-mode apps)
 *  3. Fall back to track search filtered to that artist
 */
export async function getArtistTopTracks(artistName: string): Promise<SpotifyTrack[] | null> {
  try {
    const trimmed = artistName.trim();
    console.log("[Spotify] getArtistTopTracks:", JSON.stringify(trimmed));

    // Step 1: find artist
    const searchRes = await spotifyFetch(
      `/search?q=${encodeURIComponent(trimmed)}&type=artist&limit=3`
    );
    if (!searchRes?.ok) {
      console.error("[Spotify] Artist search failed:", searchRes?.status);
      return null;
    }
    const searchData = await searchRes.json();
    const artists: any[] = searchData.artists?.items || [];
    console.log("[Spotify] Artist search results:", artists.map((a: any) => `${a.name} (${a.id})`));

    if (!artists.length) return null;
    const artist = artists[0];
    console.log("[Spotify] Using artist:", artist.name, artist.id);

    // Step 2: try official top-tracks endpoint
    for (const market of ["DE", "US", "GB"]) {
      const topRes = await spotifyFetch(`/artists/${artist.id}/top-tracks?market=${market}`);
      if (topRes?.ok) {
        const topData = await topRes.json();
        const tracks: any[] = topData.tracks || [];
        if (tracks.length) {
          console.log(`[Spotify] top-tracks (${market}): ${tracks.map((t: any) => t.name).join(", ")}`);
          return tracks.slice(0, 10).map((t: any) => ({
            uri: t.uri,
            name: t.name,
            artistName: artist.name,
            imageUrl: t.album?.images?.[0]?.url ?? null,
          }));
        }
      } else {
        const errBody = await topRes?.text().catch(() => "");
        console.log(`[Spotify] top-tracks ${market} failed:`, topRes?.status, errBody.slice(0, 120));
      }
    }

    // Step 3: fallback — simple name search filtered to this artist
    console.log("[Spotify] Falling back to track search for artist:", artist.name);
    // Use simple text search (no quoted syntax) — avoids 400 from Spotify's API parser
    const trackQ = encodeURIComponent(artist.name);
    const trackSearchRes = await spotifyFetch(
      `/search?q=${trackQ}&type=track&limit=10`
    );
    if (!trackSearchRes?.ok) {
      const errText = await trackSearchRes?.text().catch(() => "");
      console.error("[Spotify] Track search fallback failed:", trackSearchRes?.status, errText.slice(0, 100));
      return null;
    }
    const trackData = await trackSearchRes.json();
    const allItems: any[] = trackData.tracks?.items || [];
    console.log("[Spotify] Raw track search count:", allItems.length);
    // Filter strictly to tracks where this artist appears (exact name match)
    const artistLower = artist.name.toLowerCase();
    const filtered = allItems.filter((t: any) =>
      t.artists?.some((a: any) => a.name.toLowerCase() === artistLower)
    );
    // If we got enough exact matches use them; otherwise loosen to name-contains
    const source = filtered.length >= 3 ? filtered :
      allItems.filter((t: any) =>
        t.artists?.some((a: any) => a.name.toLowerCase().includes(artistLower))
      );
    const result = source.slice(0, 10).map((t: any) => ({
      uri: t.uri,
      name: t.name,
      artistName: artist.name,
      imageUrl: t.album?.images?.[0]?.url ?? null,
    }));
    console.log(`[Spotify] Track search fallback result: ${result.map((t) => t.name).join(", ")}`);
    return result.length ? result : null;
  } catch (e) {
    console.error("[Spotify] getArtistTopTracks exception:", e);
    return null;
  }
}

/** Get the user's saved playlists (up to 50). */
export async function getUserPlaylists(): Promise<SpotifyPlaylist[] | null> {
  try {
    const res = await spotifyFetch("/me/playlists?limit=20");
    if (!res?.ok) {
      console.error("[Spotify] getUserPlaylists failed:", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return (data.items || []).filter(Boolean).map((p: any) => ({
      id: p.id,
      name: p.name,
      uri: p.uri,
      // Spotify API returns either p.tracks.total or p.items.total depending on version
      trackCount: p.tracks?.total ?? p.items?.total ?? 0,
      imageUrl: p.images?.[0]?.url ?? null,
    }));
  } catch (e) {
    console.error("[Spotify] getUserPlaylists exception:", e);
    return null;
  }
}

/** Get tracks in a specific playlist (up to 30). */
export async function getPlaylistTracks(playlistId: string, limit = 30): Promise<SpotifyTrack[] | null> {
  try {
    const res = await spotifyFetch(
      `/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(uri,name,artists,album(images)))`
    );
    if (!res?.ok) {
      console.error("[Spotify] getPlaylistTracks failed:", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return (data.items || [])
      .filter((item: any) => item?.track?.uri)
      .map((item: any) => ({
        uri: item.track.uri,
        name: item.track.name,
        artistName: (item.track.artists || []).map((a: any) => a.name).join(", "),
        imageUrl: item.track.album?.images?.[0]?.url ?? null,
      }));
  } catch (e) {
    console.error("[Spotify] getPlaylistTracks exception:", e);
    return null;
  }
}

/** Play a list of track URIs in order — creates a proper sequential context so "next" works. */
export async function playTracksInOrder(uris: string[]): Promise<boolean> {
  if (!uris.length) return false;
  try {
    const preferredDevice = sdkDeviceId || await getActiveDeviceId();
    const path = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    console.log(`[Spotify] playTracksInOrder: ${uris.length} tracks, device=${preferredDevice}`);
    const res = await spotifyFetch(path, {
      method: "PUT",
      body: JSON.stringify({ uris }),
    });
    if (!res) { console.error("[Spotify] playTracksInOrder: no response"); return false; }
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => "");
      console.error("[Spotify] playTracksInOrder error:", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Spotify] playTracksInOrder exception:", e);
    return false;
  }
}

/** Play a Spotify context URI (playlist, album, artist). */
export async function playContext(contextUri: string): Promise<boolean> {
  try {
    const preferredDevice = sdkDeviceId || await getActiveDeviceId();
    const path = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    console.log(`[Spotify] playContext: ${contextUri}, device=${preferredDevice}`);
    const res = await spotifyFetch(path, {
      method: "PUT",
      body: JSON.stringify({ context_uri: contextUri }),
    });
    if (res && (res.ok || res.status === 204)) return true;
    const txt = await res?.text().catch(() => "");
    console.error("[Spotify] playContext failed:", res?.status, txt);
    return false;
  } catch (e) {
    console.error("[Spotify] playContext exception:", e);
    return false;
  }
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

export interface SpotifyQueueResult {
  current: { name: string; artistName: string; imageUrl: string | null } | null;
  upcoming: Array<{ name: string; artistName: string; imageUrl: string | null }>;
}

/** Get the current playback queue (up to 10 upcoming tracks). */
export async function getQueue(): Promise<SpotifyQueueResult | null> {
  try {
    const res = await spotifyFetch("/me/player/queue");
    if (!res?.ok) {
      console.error("[Spotify] getQueue failed:", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return {
      current: data.currently_playing ? {
        name: data.currently_playing.name,
        artistName: data.currently_playing.artists?.map((a: any) => a.name).join(", ") ?? "",
        imageUrl: data.currently_playing.album?.images?.[0]?.url ?? null,
      } : null,
      upcoming: (data.queue || []).slice(0, 10).map((t: any) => ({
        name: t.name,
        artistName: t.artists?.map((a: any) => a.name).join(", ") ?? "",
        imageUrl: t.album?.images?.[0]?.url ?? null,
      })),
    };
  } catch (e) {
    console.error("[Spotify] getQueue exception:", e);
    return null;
  }
}
