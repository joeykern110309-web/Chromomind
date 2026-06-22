import type { Request, Response } from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SCOPES = [
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
  // File takes priority over env vars so UI changes persist across restarts
  if (existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      return {
        clientId: saved.clientId || process.env.SPOTIFY_CLIENT_ID || "",
        clientSecret: saved.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || "",
        redirectUri: saved.redirectUri || process.env.SPOTIFY_REDIRECT_URI || "",
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

// Mutable config — loaded from disk, falls back to env vars
let config: SpotifyConfig = loadConfig();

let tokenStore: TokenStore | null = null;

// Auto-restore session from saved refresh token on startup
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
      console.log("[Spotify] Auto-restore failed (token may be revoked), clearing saved token");
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
    // Persist updated refresh token if Spotify rotated it
    if (data.refresh_token) {
      config.refreshToken = data.refresh_token;
      saveConfig(config);
    }
    console.log("[Spotify] Session auto-restored from saved refresh token");
  } catch (e) {
    console.error("[Spotify] Auto-restore exception:", e);
  }
}

// Kick off auto-restore immediately (non-blocking)
autoRestoreSession();

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
  // Reset auth when credentials change
  tokenStore = null;
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
  console.log("[Spotify] Login attempt — configured:", isConfigured(), "| clientId:", config.clientId ? config.clientId.slice(0, 6) + "…" : "(empty)", "| redirectUri:", config.redirectUri || "(empty)");
  if (!isConfigured()) {
    return res.redirect("/?spotify=not-configured");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    show_dialog: "true",
  });
  console.log("[Spotify] Redirecting to Spotify authorize with redirectUri:", config.redirectUri);
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}

export async function handleCallback(req: Request, res: Response) {
  const { code, error } = req.query as { code?: string; error?: string };
  console.log("[Spotify] Callback hit — code:", !!code, "| error:", error || "none");
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
    // Persist refresh token so session survives server restarts
    config.refreshToken = data.refresh_token;
    saveConfig(config);
    console.log("[Spotify] Refresh token saved to disk for auto-restore");
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

// Get available Spotify devices and return the best one to target
async function getActiveDeviceId(): Promise<string | null> {
  const res = await spotifyFetch("/me/player/devices");
  if (!res || !res.ok) {
    console.error("[Spotify] /me/player/devices failed:", res?.status);
    return null;
  }
  const data = await res.json();
  const devices: Array<{ id: string; is_active: boolean; type: string; name: string }> = data.devices || [];
  console.log("[Spotify] Available devices:", devices.map(d => `${d.name} (${d.type}, active=${d.is_active})`));
  if (!devices.length) return null;
  // Prefer the active device; fall back to first available
  const active = devices.find(d => d.is_active) || devices[0];
  return active.id;
}

// Transfer playback to a device if needed
async function ensureActiveDevice(): Promise<string | null> {
  const deviceId = await getActiveDeviceId();
  if (!deviceId) return null;
  // Transfer playback to the device (needed when Spotify is open but idle)
  await spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  return deviceId;
}

export async function playerAction(action: string): Promise<boolean> {
  let path = "";
  let method = "PUT";
  let deviceId: string | null = null;

  switch (action) {
    case "play":      path = "/me/player/play";     method = "PUT";  break;
    case "pause":     path = "/me/player/pause";    method = "PUT";  break;
    case "next":      path = "/me/player/next";     method = "POST"; break;
    case "previous":  path = "/me/player/previous"; method = "POST"; break;
    default: return false;
  }

  // Try directly first; if we get 404/403, find a device
  let res = await spotifyFetch(path, { method });
  console.log("[Spotify] playerAction", action, "→", res?.status);

  if (res && (res.status === 404 || res.status === 403)) {
    // Try to activate a device and retry
    deviceId = await ensureActiveDevice();
    if (deviceId) {
      const pathWithDevice = `${path}?device_id=${deviceId}`;
      res = await spotifyFetch(pathWithDevice, { method });
      console.log("[Spotify] playerAction retry with device", deviceId, "→", res?.status);
    }
  }

  if (res && !res.ok && res.status !== 204) {
    try {
      const errBody = await res.text();
      console.error("[Spotify] playerAction error body:", errBody);
    } catch { /* ignore */ }
  }

  return res !== null && (res.ok || res.status === 204);
}

export async function searchAndPlay(query: string): Promise<{ success: boolean; trackName?: string; artistName?: string; error?: string }> {
  try {
    const searchRes = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
    if (!searchRes || !searchRes.ok) {
      console.error("[Spotify] search failed:", searchRes?.status);
      return { success: false, error: "Search failed" };
    }
    const data = await searchRes.json();
    const track = data.tracks?.items?.[0];
    if (!track) return { success: false, error: "No tracks found for: " + query };

    console.log("[Spotify] Found track:", track.name, "by", track.artists[0]?.name, "| uri:", track.uri);

    // Try to play directly; if no active device, find one first
    let playRes = await spotifyFetch("/me/player/play", {
      method: "PUT",
      body: JSON.stringify({ uris: [track.uri] }),
    });
    console.log("[Spotify] play attempt 1 →", playRes?.status);

    if (playRes && (playRes.status === 404 || playRes.status === 403)) {
      // No active device — find one and try again
      const deviceId = await ensureActiveDevice();
      if (deviceId) {
        playRes = await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
          method: "PUT",
          body: JSON.stringify({ uris: [track.uri] }),
        });
        console.log("[Spotify] play attempt 2 (device", deviceId, ") →", playRes?.status);
      }
    }

    if (!playRes || (!playRes.ok && playRes.status !== 204)) {
      let errDetail = `HTTP ${playRes?.status}`;
      try {
        const body = await playRes?.text();
        if (body) {
          const parsed = JSON.parse(body);
          errDetail = parsed?.error?.message || errDetail;
        }
      } catch { /* ignore */ }
      console.error("[Spotify] play failed:", errDetail);
      return { success: false, error: errDetail };
    }

    return {
      success: true,
      trackName: track.name,
      artistName: track.artists.map((a: { name: string }) => a.name).join(", "),
    };
  } catch (e) {
    console.error("[Spotify] searchAndPlay exception:", e);
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
}
