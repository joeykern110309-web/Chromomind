import type { Request, Response as ExpressResponse } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
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

const DATA_DIR = join(process.cwd(), "data");
const CONFIG_FILE = join(DATA_DIR, "spotify-config.json");

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
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
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist Spotify config:", e);
  }
}

let config: SpotifyConfig = loadConfig();

// ── Per-user state ─────────────────────────────────────────────────────────────
// Each user gets their own token store and SDK device ID
const userTokenStores = new Map<string, TokenStore>();
const userSdkDeviceIds = new Map<string, string | null>();

// ── Public helpers ─────────────────────────────────────────────────────────────

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
  // Clear all user token stores when app credentials change
  userTokenStores.clear();
}

/** Restore a Spotify session from a saved refresh token (called when a user logs in via Google). */
export async function restoreFromRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
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
    userTokenStores.set(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    console.log(`[Spotify] Session restored for user: ${userId}`);
    return true;
  } catch {
    return false;
  }
}

export function setSdkDeviceId(userId: string, id: string | null) {
  userSdkDeviceIds.set(userId, id);
  console.log(`[Spotify] SDK device_id set for ${userId}:`, id);
}

export function getSdkDeviceId(userId: string): string | null {
  return userSdkDeviceIds.get(userId) ?? null;
}

export async function getAccessTokenForSdk(userId: string): Promise<string | null> {
  return getAccessToken(userId);
}

export function isConnected(userId: string): boolean {
  return userTokenStores.has(userId);
}

function isConfigured(): boolean {
  return !!(config.clientId && config.clientSecret);
}

async function refreshAccessToken(userId: string): Promise<boolean> {
  const store = userTokenStores.get(userId);
  if (!store) return false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: store.refreshToken,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    userTokenStores.set(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || store.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

async function getAccessToken(userId: string): Promise<string | null> {
  const store = userTokenStores.get(userId);
  if (!store) return null;
  if (Date.now() >= store.expiresAt - 60000) {
    const ok = await refreshAccessToken(userId);
    if (!ok) return null;
  }
  return userTokenStores.get(userId)?.accessToken ?? null;
}

async function spotifyFetch(userId: string, path: string, options: RequestInit = {}): Promise<Response | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

export function handleLogin(_req: Request, res: ExpressResponse, redirectUri?: string) {
  if (!isConfigured()) return res.redirect("/?spotify=not-configured");
  const uri = redirectUri || config.redirectUri;
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: uri,
    scope: SCOPES,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}

export async function handleCallback(
  req: Request,
  res: ExpressResponse,
  userId: string,
  onToken?: (refreshToken: string) => Promise<void>,
  redirectUri?: string,
) {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) {
    console.error("[Spotify] OAuth callback error:", error || "no code");
    return res.redirect(`/?spotify=error&reason=${encodeURIComponent(error || "no_code")}`);
  }
  const uri = redirectUri || config.redirectUri;
  console.log("[Spotify] Exchanging code for user:", userId, "redirect_uri:", uri);
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
        redirect_uri: uri,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error("[Spotify] Token exchange failed:", tokenRes.status, body);
      const reason = body.includes("redirect_uri") ? "redirect_uri_mismatch" : `http_${tokenRes.status}`;
      return res.redirect(`/?spotify=error&reason=${encodeURIComponent(reason)}`);
    }
    const data = await tokenRes.json();
    userTokenStores.set(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    if (onToken) await onToken(data.refresh_token);
    res.redirect("/?spotify=connected");
  } catch (e) {
    console.error("[Spotify] Token exchange exception:", e);
    res.redirect("/?spotify=error&reason=exception");
  }
}

export async function getNowPlaying(userId: string): Promise<object | null> {
  const res = await spotifyFetch(userId, "/me/player/currently-playing");
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
      trackId: track.id || null,
      artistId: track.artists?.[0]?.id || null,
    };
  } catch {
    return null;
  }
}

export async function getRecommendations(userId: string, seedTrackId: string, seedArtistId?: string | null): Promise<SpotifyTrack[] | null> {
  try {
    const params = new URLSearchParams({ limit: "10", seed_tracks: seedTrackId });
    if (seedArtistId) params.set("seed_artists", seedArtistId);
    const res = await spotifyFetch(userId, `/recommendations?${params.toString()}`);
    if (!res?.ok) {
      console.error("[Spotify] Recommendations failed:", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const tracks: any[] = data.tracks || [];
    if (!tracks.length) return null;
    return tracks.map((t: any) => ({
      uri: t.uri,
      name: t.name,
      artistName: t.artists.map((a: any) => a.name).join(", "),
      imageUrl: t.album?.images?.[0]?.url ?? null,
    }));
  } catch (err) {
    console.error("[Spotify] getRecommendations error:", err);
    return null;
  }
}

async function getActiveDeviceId(userId: string): Promise<string | null> {
  const res = await spotifyFetch(userId, "/me/player/devices");
  if (!res || !res.ok) return null;
  const data = await res.json();
  const devices: Array<{ id: string; is_active: boolean; type: string; name: string }> = data.devices || [];
  if (!devices.length) return null;
  const active = devices.find(d => d.is_active) || devices[0];
  return active.id;
}

export async function playerAction(userId: string, action: string): Promise<boolean> {
  let path = "";
  let method = "PUT";
  switch (action) {
    case "play":      path = "/me/player/play";     method = "PUT";  break;
    case "pause":     path = "/me/player/pause";    method = "PUT";  break;
    case "next":      path = "/me/player/next";     method = "POST"; break;
    case "previous":  path = "/me/player/previous"; method = "POST"; break;
    default: return false;
  }
  const preferredDevice = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
  const targetPath = preferredDevice ? `${path}?device_id=${preferredDevice}` : path;
  const res = await spotifyFetch(userId, targetPath, { method });
  if (res && !res.ok && res.status !== 204) {
    try { console.error("[Spotify] playerAction error:", await res.text()); } catch { /* ignore */ }
  }
  const ok = res !== null && (res.ok || res.status === 204);
  if (ok && (action === "next" || action === "previous")) {
    await new Promise(r => setTimeout(r, 800));
    const preferredDev2 = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
    const resumePath = preferredDev2 ? `/me/player/play?device_id=${preferredDev2}` : "/me/player/play";
    await spotifyFetch(userId, resumePath, { method: "PUT" });
  }
  return ok;
}

export async function searchAndPlay(userId: string, query: string): Promise<{ success: boolean; trackName?: string; artistName?: string; error?: string }> {
  try {
    const searchRes = await spotifyFetch(userId, `/search?q=${encodeURIComponent(query)}&type=track&limit=5`);
    if (!searchRes || !searchRes.ok) return { success: false, error: "Search failed" };
    const data = await searchRes.json();
    const track = data.tracks?.items?.[0];
    if (!track) return { success: false, error: "No tracks found for: " + query };

    const preferredDevice = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
    const playPath = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    const playRes = await spotifyFetch(userId, playPath, {
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

export async function getStatus(userId: string) {
  if (!userTokenStores.has(userId)) return { connected: false, nowPlaying: null, configured: isConfigured() };
  const nowPlaying = await getNowPlaying(userId);
  return { connected: true, nowPlaying, configured: true };
}

export function disconnect(userId: string) {
  userTokenStores.delete(userId);
  userSdkDeviceIds.delete(userId);
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

export async function searchTracks(userId: string, query: string, limit = 5): Promise<SpotifyTrack[] | null> {
  try {
    const res = await spotifyFetch(userId, `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
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

export async function getArtistTopTracks(userId: string, artistName: string): Promise<SpotifyTrack[] | null> {
  try {
    const trimmed = artistName.trim();
    console.log("[Spotify] getArtistTopTracks:", JSON.stringify(trimmed));

    const searchRes = await spotifyFetch(userId, `/search?q=${encodeURIComponent(trimmed)}&type=artist&limit=3`);
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

    for (const market of ["DE", "US", "GB"]) {
      const topRes = await spotifyFetch(userId, `/artists/${artist.id}/top-tracks?market=${market}`);
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

    console.log("[Spotify] Falling back to track search for artist:", artist.name);
    const trackQ = encodeURIComponent(artist.name);
    const trackSearchRes = await spotifyFetch(userId, `/search?q=${trackQ}&type=track&limit=10`);
    if (!trackSearchRes?.ok) {
      const errText = await trackSearchRes?.text().catch(() => "");
      console.error("[Spotify] Track search fallback failed:", trackSearchRes?.status, errText.slice(0, 100));
      return null;
    }
    const trackData = await trackSearchRes.json();
    const allItems: any[] = trackData.tracks?.items || [];
    const artistLower = artist.name.toLowerCase();
    const filtered = allItems.filter((t: any) =>
      t.artists?.some((a: any) => a.name.toLowerCase() === artistLower)
    );
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

export async function getUserPlaylists(userId: string): Promise<SpotifyPlaylist[] | null> {
  try {
    const res = await spotifyFetch(userId, "/me/playlists?limit=20");
    if (!res?.ok) {
      console.error("[Spotify] getUserPlaylists failed:", res?.status, await res?.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return (data.items || []).filter(Boolean).map((p: any) => ({
      id: p.id,
      name: p.name,
      uri: p.uri,
      trackCount: p.tracks?.total ?? p.items?.total ?? 0,
      imageUrl: p.images?.[0]?.url ?? null,
    }));
  } catch (e) {
    console.error("[Spotify] getUserPlaylists exception:", e);
    return null;
  }
}

export async function getPlaylistTracks(userId: string, playlistId: string, limit = 30): Promise<SpotifyTrack[] | null> {
  try {
    const res = await spotifyFetch(
      userId,
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

export async function playTracksInOrder(userId: string, uris: string[]): Promise<boolean> {
  if (!uris.length) return false;
  try {
    const preferredDevice = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
    const path = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    console.log(`[Spotify] playTracksInOrder: ${uris.length} tracks, device=${preferredDevice}`);
    const res = await spotifyFetch(userId, path, {
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

export async function playContext(userId: string, contextUri: string): Promise<boolean> {
  try {
    const preferredDevice = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
    const path = preferredDevice ? `/me/player/play?device_id=${preferredDevice}` : "/me/player/play";
    console.log(`[Spotify] playContext: ${contextUri}, device=${preferredDevice}`);
    const res = await spotifyFetch(userId, path, {
      method: "PUT",
      body: JSON.stringify({ context_uri: contextUri }),
    });
    if (!res) return false;
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => "");
      console.error("[Spotify] playContext error:", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Spotify] playContext exception:", e);
    return false;
  }
}

export async function addToQueue(userId: string, uri: string): Promise<boolean> {
  try {
    const preferredDevice = getSdkDeviceId(userId) || await getActiveDeviceId(userId);
    const path = preferredDevice
      ? `/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${preferredDevice}`
      : `/me/player/queue?uri=${encodeURIComponent(uri)}`;
    const res = await spotifyFetch(userId, path, { method: "POST" });
    return res !== null && (res.ok || res.status === 204);
  } catch {
    return false;
  }
}

export async function getQueue(userId: string): Promise<object | null> {
  try {
    const res = await spotifyFetch(userId, "/me/player/queue");
    if (!res?.ok) return null;
    const data = await res.json();
    return {
      currentlyPlaying: data.currently_playing ? {
        name: data.currently_playing.name,
        artistName: data.currently_playing.artists?.map((a: any) => a.name).join(", "),
        imageUrl: data.currently_playing.album?.images?.[0]?.url ?? null,
        uri: data.currently_playing.uri,
      } : null,
      queue: (data.queue || []).slice(0, 10).map((t: any) => ({
        name: t.name,
        artistName: t.artists?.map((a: any) => a.name).join(", "),
        imageUrl: t.album?.images?.[0]?.url ?? null,
        uri: t.uri,
      })),
    };
  } catch {
    return null;
  }
}
