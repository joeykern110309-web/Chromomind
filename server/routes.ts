import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { storage } from "./storage";
import { sendMessageSchema, renameConversationSchema } from "@shared/schema";
import { ZodError } from "zod";
import { passport, GOOGLE_CONFIGURED } from "./auth";
import {
  handleLogin,
  handleCallback,
  getStatus,
  playerAction,
  getNowPlaying,
  disconnect,
  getConfig,
  updateConfig,
  searchAndPlay,
  searchTracks,
  getArtistTopTracks,
  getUserPlaylists,
  getPlaylistTracks,
  playContext,
  playTracksInOrder,
  addToQueue,
  getQueue,
  getAccessTokenForSdk,
  setSdkDeviceId,
  restoreFromRefreshToken,
  getRecommendations,
} from "./spotify";

/** Embed a structured card at the top of an AI message so the frontend renders rich UI */
function spotifyCard(data: object, text: string): string {
  return `SPOTIFY_CARD:${JSON.stringify(data)}\n${text}`;
}

// ── Broadcast store (in-memory, all connected clients poll this) ───────────────
interface Broadcast {
  id: string;
  message: string;
  timestamp: string;
}
let activeBroadcast: Broadcast | null = null;

// ── AI clients ────────────────────────────────────────────────────────────────
const groqClients: Groq[] = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
]
  .filter(Boolean)
  .map((key) => new Groq({ apiKey: key as string }));

const replitAI = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function chatCompletion(messages: ChatMsg[], maxTokens: number, light = false): Promise<string> {
  for (let i = 0; i < groqClients.length; i++) {
    try {
      const response = await groqClients[i].chat.completions.create({
        model: light ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile",
        messages,
        max_tokens: maxTokens,
      });
      return response.choices[0]?.message?.content?.trim() || "";
    } catch (err: any) {
      console.error(`[AI] Groq key ${i + 1} failed (${err?.status || err?.message}), trying next…`);
    }
  }
  console.log("[AI] All Groq keys exhausted, using Replit AI");
  const response = await replitAI.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content?.trim() || "";
}

const SYSTEM_PROMPT = `You are a warm, intelligent, and curious AI assistant. You communicate naturally and humanly — like a knowledgeable friend who genuinely enjoys conversation.

Guidelines:
- Be conversational, warm, and engaging — not robotic or overly formal
- Show genuine curiosity and personality in your responses
- Remember the full context of our conversation and refer back to earlier points naturally
- Be concise when appropriate, but elaborate when a topic deserves depth
- Use natural language patterns including contractions, varied sentence lengths, and occasional rhetorical questions
- When you don't know something, say so honestly and offer to explore it together
- Share your perspective thoughtfully while remaining open to other viewpoints
- Use examples, analogies, and storytelling to make complex ideas accessible`;

// Language detection — returns language name or null for English
function detectLanguage(text: string): string | null {
  const t = text.toLowerCase();
  const de = /[äöüß]|\b(ich|du|er|sie|wir|ihr|ist|bin|bist|sind|haben|hat|habe|und|oder|aber|nicht|das|die|der|ein|eine|auch|noch|kein|beim|bitte|danke|hallo|ja|nein|gut|sehr|macht|kannst|musst|willst|doch|mal|halt|echt|schon|gerade|jetzt|immer|nichts|alles|weil|wenn|dass|wie|was|wer|wo|warum)\b/.test(t);
  const fr = /\b(je|tu|il|elle|nous|vous|ils|elles|est|sont|et|ou|mais|pas|ne|le|la|les|un|une|des|du|bonjour|merci|oui|non|très|bien|comment|pourquoi|que|qui|où|quoi)\b/.test(t);
  const es = /\b(yo|él|ella|nosotros|vosotros|ellos|ellas|son|estar|ser|y|pero|no|el|los|las|un|una|del|que|en|con|por|para|hola|gracias|sí|bueno|bien|cómo|qué|quién|dónde)\b/.test(t);
  const pt = /\b(eu|tu|ele|ela|nós|vós|eles|elas|está|são|e|ou|mas|não|o|a|os|as|um|uma|dos|das|que|em|com|por|para|olá|obrigado|sim|bom|bem|como|quem|onde)\b/.test(t);
  const it = /\b(io|lui|lei|noi|voi|loro|è|sono|e|o|ma|non|il|la|i|le|un|una|dei|delle|che|in|con|per|ciao|grazie|sì|no|buono|bene|come|perché|chi|dove)\b/.test(t);
  if (de) return "German";
  if (fr) return "French";
  if (es) return "Spanish";
  if (pt) return "Portuguese";
  if (it) return "Italian";
  return null;
}

// Priming lines the model gets as a fake "assistant" turn — forces language continuation
const LANG_PRIMERS: Record<string, string> = {
  German:     "Verstanden. Ich antworte jetzt ausschließlich auf Deutsch.",
  French:     "Compris. Je répondrai exclusivement en français.",
  Spanish:    "Entendido. Responderé exclusivamente en español.",
  Portuguese: "Entendido. Responderei exclusivamente em português.",
  Italian:    "Capito. Risponderò esclusivamente in italiano.",
};

async function generateTitle(firstMessage: string): Promise<string> {
  try {
    const title = await chatCompletion(
      [{ role: "user", content: `Generate a short, descriptive title (4-6 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or punctuation: "${firstMessage.slice(0, 200)}"` }],
      20,
      true,
    );
    return title || "New Conversation";
  } catch {
    return firstMessage.slice(0, 50);
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Google Auth ──────────────────────────────────────────────────────────────
  app.get("/api/auth/config", (_req, res) => {
    res.json({ googleEnabled: GOOGLE_CONFIGURED });
  });

  const OWNER_EMAIL = "joeykern11.03.09@gmail.com";
  const OWNER_GOOGLE_ID = "google_108577457563246748278";

  const requireOwner = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ error: "Unauthorized" });
    const u = req.user as Express.User;
    if (u.id !== OWNER_GOOGLE_ID && (u.username?.toLowerCase() ?? "") !== OWNER_EMAIL)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };

  // ── Admin: broadcast ────────────────────────────────────────────────────────
  app.get("/api/admin/broadcast", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ broadcast: activeBroadcast });
  });

  app.post("/api/admin/broadcast", requireOwner, (req, res) => {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) {
      activeBroadcast = null;
    } else {
      activeBroadcast = { id: randomUUID(), message: message.trim(), timestamp: new Date().toISOString() };
      console.log(`[Admin] Broadcast set: "${activeBroadcast.message}"`);
    }
    res.json({ success: true, broadcast: activeBroadcast });
  });

  app.delete("/api/admin/broadcast", requireOwner, (_req, res) => {
    activeBroadcast = null;
    res.json({ success: true });
  });

  // ── Owner notes (read + write) ───────────────────────────────────────────────
  app.get("/api/owner/notes", requireOwner, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ notes: await storage.getOwnerNotes() });
  });

  app.post("/api/owner/notes", requireOwner, async (req, res) => {
    const { notes } = req.body;
    if (typeof notes !== "string") return res.status(400).json({ error: "notes must be a string" });
    await storage.setOwnerNotes(notes);
    res.json({ success: true });
  });

  // ── Admin: stats ────────────────────────────────────────────────────────────
  app.get("/api/admin/stats", requireOwner, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const users = await storage.getAllUsers();
    const convCounts = await storage.getConversationCountByUser();
    res.json({
      userCount: users.length,
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        conversationCount: convCounts[u.id] ?? 0,
        hasSpotify: !!u.spotifyRefreshToken,
      })),
    });
  });

  app.get("/api/auth/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = req.user as Express.User;
    const isOwner =
      user.id === OWNER_GOOGLE_ID ||
      (user.username?.toLowerCase() ?? "") === OWNER_EMAIL;
    console.log(`[Auth] /me → ${user.id} (${user.username}) isOwner=${isOwner}`);
    res.json({ id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, isOwner });
  });

  /** Build the absolute callback URL from the incoming request — works on dev AND prod */
  function googleCallbackURL(req: Request): string {
    const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
    const host  = req.get("x-forwarded-host") || req.get("host") || "localhost:5000";
    return `${proto}://${host}/api/auth/google/callback`;
  }

  if (GOOGLE_CONFIGURED) {
    app.get("/api/auth/google", (req, res, next) => {
      passport.authenticate("google", {
        scope: ["profile", "email"],
        callbackURL: googleCallbackURL(req),
      })(req, res, next);
    });

    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        passport.authenticate("google", {
          callbackURL: googleCallbackURL(req),
          failureRedirect: "/?auth_error=1",
        })(req, res, next);
      },
      async (req, res) => {
        const user = req.user as Express.User;
        // Only restore Spotify session when the owner logs in — prevents other users
        // from hijacking or overwriting the global Spotify tokenStore
        const isOwnerLogin =
          user?.id === OWNER_GOOGLE_ID ||
          (user?.username?.toLowerCase() ?? "") === OWNER_EMAIL;
        if (isOwnerLogin) {
          const savedToken = await storage.getUserSpotifyToken(user.id);
          if (savedToken) {
            const ok = await restoreFromRefreshToken(savedToken);
            console.log(`[Auth] Spotify restore on owner login: ${ok ? "OK" : "failed"}`);
          }
        }
        res.redirect("/");
      }
    );
  } else {
    app.get("/api/auth/google", (_req, res) => {
      res.status(503).json({ error: "Google auth not configured" });
    });
  }

  app.post("/api/auth/logout", (req: any, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  // ── Spotify Config ────────────────────────────────────────────────────────────
  app.get("/api/spotify/config", (_req, res) => res.json(getConfig()));
  app.post("/api/spotify/config", (req, res) => {
    const { clientId, clientSecret, redirectUri } = req.body;
    updateConfig({
      ...(clientId !== undefined ? { clientId } : {}),
      ...(clientSecret !== undefined ? { clientSecret } : {}),
      ...(redirectUri !== undefined ? { redirectUri } : {}),
    });
    const cfg = getConfig();
    console.log("[Spotify] Config saved — clientId:", !!cfg.clientId, "| hasSecret:", cfg.hasSecret, "| redirectUri:", cfg.redirectUri);
    res.json({ success: true, loginUrl: "https://chromomind.replit.app/api/spotify/login" });
  });

  const SPOTIFY_REDIRECT_URI = "https://chromomind.replit.app/api/spotify/callback";

  // ── Spotify OAuth ─────────────────────────────────────────────────────────────
  app.get("/api/spotify/login", (req, res) => handleLogin(req, res, SPOTIFY_REDIRECT_URI));
  app.get("/api/spotify/callback", async (req, res) => {
    await handleCallback(req, res, async (refreshToken) => {
      const user = req.user as Express.User | undefined;
      // Only save the token to the owner account — Spotify is owner-only
      if (user?.id === OWNER_GOOGLE_ID || (user?.username?.toLowerCase() ?? "") === OWNER_EMAIL) {
        await storage.updateUserSpotifyToken(user!.id, refreshToken);
        console.log(`[Auth] Spotify token saved to owner account: ${user!.id}`);
      }
    }, SPOTIFY_REDIRECT_URI);
  });
  app.get("/api/spotify/queue", async (_req, res) => {
    try {
      const queue = await getQueue();
      if (!queue) return res.status(503).json({ error: "Spotify not connected" });
      res.json(queue);
    } catch { res.status(500).json({ error: "Failed to fetch queue" }); }
  });

  app.get("/api/spotify/status", async (_req, res) => {
    try { res.json(await getStatus()); }
    catch { res.status(500).json({ error: "Failed to get Spotify status" }); }
  });
  app.get("/api/spotify/now-playing", async (_req, res) => {
    try { res.json({ nowPlaying: await getNowPlaying() }); }
    catch { res.status(500).json({ error: "Failed to get now playing" }); }
  });
  app.post("/api/spotify/player/:action", async (req, res) => {
    try { res.json({ success: await playerAction(req.params.action) }); }
    catch { res.status(500).json({ error: "Player action failed" }); }
  });
  app.post("/api/spotify/disconnect", (_req, res) => {
    disconnect(); setSdkDeviceId(null); res.json({ success: true });
  });
  app.post("/api/spotify/play-context", async (req, res) => {
    const { uri } = req.body as { uri?: string };
    if (!uri) return res.status(400).json({ error: "uri required" });
    try {
      const ok = await playContext(uri);
      res.json({ success: ok });
    } catch { res.status(500).json({ error: "Failed to play context" }); }
  });
  app.post("/api/spotify/play-tracks", async (req, res) => {
    const { uris } = req.body as { uris?: string[] };
    if (!uris?.length) return res.status(400).json({ error: "uris required" });
    try {
      const ok = await playTracksInOrder(uris);
      res.json({ success: ok });
    } catch { res.status(500).json({ error: "Failed to play tracks" }); }
  });
  app.get("/api/spotify/playlist/:id/tracks", async (req, res) => {
    try {
      const tracks = await getPlaylistTracks(req.params.id, 30);
      if (!tracks) return res.status(500).json({ error: "Failed to get tracks" });
      res.json(tracks);
    } catch { res.status(500).json({ error: "Failed to get playlist tracks" }); }
  });
  // Debug: test raw Spotify endpoints
  app.get("/api/spotify/debug", async (req, res) => {
    try {
      const token = await getAccessTokenForSdk();
      if (!token) return res.status(401).json({ error: "Not connected" });
      const artistName = (req.query.artist as string) || "Dardan";
      // Step 1: artist search
      const artistSearchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=3`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const artistSearchData = await artistSearchRes.json() as any;
      const artists: any[] = artistSearchData.artists?.items || [];
      const firstArtist = artists[0];
      // Step 2: top-tracks (raw)
      let topTracksResult: any = null;
      if (firstArtist) {
        const ttRes = await fetch(
          `https://api.spotify.com/v1/artists/${firstArtist.id}/top-tracks?market=DE`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const ttBody = await ttRes.text();
        topTracksResult = { status: ttRes.status, body: ttBody.slice(0, 400) };
      }
      // Step 3: track search fallback
      let trackSearchResult: any = null;
      if (firstArtist) {
        const tsRes = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${firstArtist.name}"`)}&type=track&limit=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const tsData = await tsRes.json() as any;
        const tracks: any[] = (tsData.tracks?.items || []).map((t: any) => ({
          name: t.name, uri: t.uri, artists: t.artists?.map((a: any) => a.name)
        }));
        trackSearchResult = { status: tsRes.status, tracks };
      }
      // Full getArtistTopTracks call
      const fullResult = await getArtistTopTracks(artistName);
      res.json({
        query: artistName,
        artistSearch: { count: artists.length, top: artists.map((a: any) => ({ name: a.name, id: a.id })) },
        topTracksRaw: topTracksResult,
        trackSearchFallback: trackSearchResult,
        fullResult: fullResult ? fullResult.map(t => ({ name: t.name, uri: t.uri })) : null,
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
  app.get("/api/spotify/test-artist", async (req, res) => {
    const name = (req.query.name as string) || "Dardan";
    // Test raw fetch vs spotifyFetch
    const token = await getAccessTokenForSdk();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=track&limit=10`;
    const rawRes = token ? await fetch(url, { headers: { Authorization: `Bearer ${token}` } }) : null;
    const rawData = rawRes ? await rawRes.json() : null;
    const rawTracks = (rawData?.tracks?.items || []).map((t: any) => ({ name: t.name, artists: t.artists?.map((a: any) => a.name) }));
    // Also run getArtistTopTracks
    const result = await getArtistTopTracks(name);
    res.json({ name, rawStatus: rawRes?.status, rawCount: rawTracks.length, rawSample: rawTracks.slice(0, 3), result, count: result?.length ?? 0 });
  });

  app.get("/api/spotify/sdk-token", async (_req, res) => {
    const token = await getAccessTokenForSdk();
    if (!token) return res.status(401).json({ error: "Not connected" });
    res.json({ accessToken: token });
  });
  app.post("/api/spotify/device", (req, res) => {
    const { deviceId } = req.body as { deviceId: string };
    if (deviceId) { setSdkDeviceId(deviceId); res.json({ success: true }); }
    else res.status(400).json({ error: "deviceId required" });
  });

  // ── Conversations (auth required) ─────────────────────────────────────────────
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as Express.User).id;
      const conversations = await storage.getConversations(userId);
      res.json(conversations);
    } catch { res.status(500).json({ error: "Failed to fetch conversations" }); }
  });

  app.get("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      res.json(conversation);
    } catch { res.status(500).json({ error: "Failed to fetch conversation" }); }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as Express.User).id;
      const conversation = await storage.createConversation("New Conversation", userId);
      res.json(conversation);
    } catch { res.status(500).json({ error: "Failed to create conversation" }); }
  });

  app.patch("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { title } = renameConversationSchema.parse(req.body);
      const updated = await storage.updateConversationTitle(req.params.id, title);
      if (!updated) return res.status(404).json({ error: "Conversation not found" });
      res.json(updated);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteConversation(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Conversation not found" });
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete conversation" }); }
  });

  // ── Chat (auth required) ──────────────────────────────────────────────────────
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const { conversationId, content } = sendMessageSchema.parse(req.body);
      const chatUser = req.user as Express.User;
      const userId = chatUser.id;
      const isOwner =
        chatUser.id === OWNER_GOOGLE_ID ||
        (chatUser.username?.toLowerCase() ?? "") === OWNER_EMAIL;

      let convId = conversationId;
      let conversation;

      if (!convId) {
        conversation = await storage.createConversation("New Conversation", userId);
        convId = conversation.id;
      } else {
        conversation = await storage.getConversation(convId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      }

      const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      await storage.addMessage(convId, { role: "user", content, timestamp: now });

      const updatedConversation = await storage.getConversation(convId);
      const historyMessages: ChatMsg[] = (updatedConversation?.messages || []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      // ── Language detection ─────────────────────────────────────────────────
      // First check current message, then fall back to recent history
      let detectedLang = detectLanguage(content);
      if (!detectedLang && historyMessages.length > 1) {
        const recentUserMsgs = historyMessages
          .slice(0, -1) // exclude the current message (last in array)
          .filter((m) => m.role === "user")
          .slice(-4)
          .map((m) => m.content);
        for (const prev of recentUserMsgs.reverse()) {
          const lang = detectLanguage(prev);
          if (lang) { detectedLang = lang; break; }
        }
      }

      const ownerNotes = isOwner ? await storage.getOwnerNotes() : "";

      let systemPrompt = detectedLang
        ? `CRITICAL SYSTEM RULE: The user is communicating in ${detectedLang}. You MUST respond ONLY in ${detectedLang}. Using any other language is a violation. Never switch to English.\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT;

      if (isOwner && ownerNotes.trim()) {
        systemPrompt += `\n\n--- OWNER NOTES ---\nThe following are private notes written by the owner (you are talking to the owner now). You can read, reference, and update these notes when asked. To update the notes, include a <notes_update>new full notes content here</notes_update> block anywhere in your response — it will be saved automatically and stripped from the visible reply.\n\nCurrent notes:\n${ownerNotes}\n--- END NOTES ---`;
      } else if (isOwner) {
        systemPrompt += `\n\nYou are talking to the owner. They have a private notes section in settings where they can write ideas, feature requests, and reminders. It is currently empty. If asked to save something to notes, include a <notes_update>content here</notes_update> block in your response and it will be saved automatically.`;
      }

      // ── Spotify music intent detection ──────────────────────────────────────
      let directResponse: string | null = null;

      // Helper: language-aware response selector
      const loc = (de: string, en: string) => detectedLang === "German" ? de : en;

      try {
        const msg = content.toLowerCase();

        // ── 1. Artist top-track patterns (EN + DE) ─────────────────────────
        // Strategy: use \w+ (word-chars only, no space) then strip trailing 's/'s
        // This is more reliable than (.+?) which can fail to match in edge cases.
        //
        // Covers: "spiel dardans besten song" / "play dardan's top track"
        //         "play top song by dardan" / "spiel den besten song von dardan"
        let artistTopName: string | null = null;
        {
          // "spiel ARTIST[s/'] besten/top/best song/track/..."
          const m1 = msg.match(/^(?:play|spiel(?:e)?)\s+(\w[\w ]*?)(?:'s|'s|s)?\s+(?:top|best|besten?|gr[öo]ßten?|biggest)\s+(?:track|song|hit|lied|titel)\b/i);
          if (m1) {
            artistTopName = (m1[1] || "").replace(/s\s*$/, "").trim();
          }
          // "play top/best song by/von ARTIST"
          if (!artistTopName) {
            const m2 = msg.match(/^(?:play|spiel(?:e)?)\s+(?:(?:the|den?|die|das)\s+)?(?:top|best|besten?)\s+(?:track|song|hit|lied|titel)\s+(?:by|from|von)\s+(.+)/i);
            if (m2) artistTopName = (m2[1] || "").trim();
          }
        }
        if (artistTopName) console.log("[Chat] Artist top-track name extracted:", artistTopName);

        // "play something from Dardan" / "spiel etwas von Dardan" / "play a song by Dardan"
        let artistFromName: string | null = null;
        {
          const m1 = msg.match(/^(?:play|spiel(?:e)?)\s+(?:etwas|something|einen?\s+(?:song|titel)|ein\s+lied|a\s+(?:song|track))\s+(?:from|by|von)\s+(.+)/i);
          if (m1) artistFromName = (m1[1] || "").trim();
          if (!artistFromName) {
            const m2 = msg.match(/^(?:play|spiel(?:e)?)\s+(?:a\s+)?(?:song|track|lied|titel)\s+(?:from|by|von)\s+(.+)/i);
            if (m2) artistFromName = (m2[1] || "").trim();
          }
        }
        if (artistFromName) console.log("[Chat] Artist-from name extracted:", artistFromName);

        // ── 2. Playlist patterns ───────────────────────────────────────────
        // Check play-a-specific-playlist FIRST (more specific intent)
        const playlistPlayMatch = msg.match(
          /(?:play|open|spiel(?:e)?|öffne?|starte?)\s+(?:my|meine[nm]?|die|den?|der)?\s*(.+?)\s*(?:playlist|wiedergabeliste)\b/i
        );

        // List all playlists: only fires when NOT playing a specific playlist
        // Matches: "zeig meine Playlists", "show my playlists", "welche Playlists habe ich"
        // Does NOT match: "spiel meine Ka Playlist" (caught by playlistPlayMatch above)
        const isPlaylistList = !playlistPlayMatch && (
          /\b(?:show|list|zeig(?:e)?|anzeig(?:en)?|liste?)\b.{0,40}\bplaylists\b/i.test(msg) ||
          /\bplaylists\b.{0,40}\b(?:show|list|zeig|anzeig|auflisten)\b/i.test(msg) ||
          /\b(?:welche|was\s+(?:sind|hab(?:e)?|hast))\b.{0,40}\bplaylists?\b/i.test(msg) ||
          /\b(?:meine|my)\s+playlists\b/i.test(msg) ||
          /\balle\s+(?:meine[nr]?\s+)?playlists?\b/i.test(msg)
        );

        // ── 3. Queue patterns ──────────────────────────────────────────────
        // "add X to queue" / "füge X zur Warteschlange hinzu" / "queue X"
        const queueAddMatch =
          msg.match(/(?:add|füge?|stell(?:e)?)\s+(.+?)\s+(?:(?:to|in)(?:\s+(?:the|die|den?))?\s+(?:queue|warteschlange)|als\s+n[äa]chstes?|next|zur\s+(?:warteschlange|queue))/i) ||
          msg.match(/^queue\s+(.+)/i);

        // "show queue" / "zeig mir die Warteschlange" / "was kommt als nächstes"
        const isQueueShow =
          /(?:show|what(?:'s|\s+is)\s+(?:in|on)|zeig(?:e)?(?:\s+mir)?)\s+(?:(?:the|my|die|der|meine[nm]?)?\s+)?(?:queue|warteschlange)/i.test(msg) ||
          /(?:queue|warteschlange)\s+(?:show|anzeigen|zeigen)/i.test(msg) ||
          /was\s+kommt\s+(?:als\s+n[äa]chstes?|danach|jetzt|als\s+n[äa]chstes)/i.test(msg) ||
          /was\s+(?:l[äa]uft|spielt|kommt)\s+(?:danach|als\s+n[äa]chstes?|nach\s+diesem?)/i.test(msg) ||
          /zeig(?:e)?\s+(?:mir\s+)?(?:(?:die|meine|der)\s+)?warteschlange/i.test(msg) ||
          /n[äa]chste[rns]?\s+(?:song|track|lied|titel|musik)/i.test(msg) ||
          /\bwarteschlange\b/i.test(msg);

        // ── 4. Standard play / control patterns ───────────────────────────
        const PLAY_PATTERNS = [
          /(?:^|\s)(?:play\s+me|put\s+on|start\s+playing)\s+(.+)/i,
          /(?:^|\s)(?:can|could|would)\s+you\s+play\s+(.+)/i,
          /(?:^|\s)i(?:'d)?\s+(?:want|like|love)\s+to\s+(?:hear|listen\s+to|play)\s+(.+)/i,
          /(?:^|\s)i\s+wanna\s+(?:hear|listen\s+to)\s+(.+)/i,
          /(?:^|\s)listen\s+to\s+(.+)/i,
          /(?:^|\s)spiel(?:e)?\s+(?:mir\s+)?(.+)/i,
          /(?:^|\s)leg\s+(.+?)\s+auf(?:\s|$)/i,
          /(?:^|\s)ich\s+(?:will|m[öo]chte|w[üu]rde\s+gern)\s+(?:gern\s+)?(.+?)\s+h[öo]ren/i,
          /(?:^|\s)(?:joue|mets|lance)\s+(?:moi\s+)?(.+)/i,
          /(?:^|\s)(?:pon|reproduce|toca)\s+(.+)/i,
          /(?:^|\s)play\s+(.+)/i,
        ];

        let playMatch: RegExpMatchArray | null = null;
        // Don't fire generic play if it's already an artist-specific command
        if (!artistTopName && !artistFromName && !playlistPlayMatch) {
          for (const pattern of PLAY_PATTERNS) {
            playMatch = msg.match(pattern);
            if (playMatch) break;
          }
        }

        const isSkip   = /\b(skip|next( song| track)?|[üu]berspringen|weiter|passer|suivant|siguiente)\b/.test(msg);
        const isPrev   = /\b(previous|prev|go back|last song|zur[üu]ck|pr[ée]c[ée]dent|anterior)\b/.test(msg);
        const isPause  = /\b(pause|stop(?: the music| playing)?|pausieren|anhalten|pausa|arr[eê]ter)\b/.test(msg) && !playMatch && !artistTopName && !artistFromName;
        const isResume = /\b(resume|unpause|continue playing|play again|weiterspielen|fortsetzen|reprendre|reanudar)\b/.test(msg);

        const isRecommendations = !playMatch && !artistTopName && !artistFromName && (
          /\b(?:ähnlich(?:es?|e)?|similar|like this|more like|etwas\s+ähnliches?|was\s+ähnliches?)\b/i.test(msg) ||
          /\b(?:empfehl(?:ung(?:en)?|e|t)|recommend(?:ation(?:s)?)?)\b/i.test(msg) ||
          /\b(?:mehr\s+davon|more\s+of\s+this|more\s+songs?\s+like|songs?\s+like\s+this)\b/i.test(msg) ||
          /\b(?:was\s+passt\s+dazu|etwas\s+passendes?|something\s+similar|something\s+like\s+that)\b/i.test(msg) ||
          /\b(?:entdecke?n?|discover|find\s+similar|finde?\s+ähnliches?)\b/i.test(msg)
        );

        const isMusicCommand = !!(playMatch || isSkip || isPrev || isPause || isResume ||
          artistTopName || artistFromName || isPlaylistList || playlistPlayMatch ||
          queueAddMatch || isQueueShow || isRecommendations);

        const status = await getStatus();

        if (isMusicCommand && !status.connected) {
          const notConnectedMsgs: Record<string, string> = {
            German:     "Um Musik zu steuern, musst du zuerst dein Spotify-Konto verbinden. Klicke auf das Musik-Symbol in der Seitenleiste.",
            French:     "Pour contrôler la musique, connecte d'abord ton compte Spotify. Clique sur l'icône musique dans la barre latérale.",
            Spanish:    "Para controlar la música, primero conecta tu cuenta de Spotify. Haz clic en el ícono de música en la barra lateral.",
            Portuguese: "Para controlar a música, conecta primeiro tua conta do Spotify. Clica no ícone de música na barra lateral.",
            Italian:    "Per controllare la musica, collega prima il tuo account Spotify. Clicca sull'icona musica nella barra laterale.",
            English:    "To control music, please connect your Spotify account first — click the music icon in the sidebar.",
          };
          directResponse = notConnectedMsgs[detectedLang ?? "English"] ?? notConnectedMsgs["English"];

        } else if (status.connected) {

          // ── Artist top track ─────────────────────────────────────────────
          if (artistTopName) {
            const tracks = await getArtistTopTracks(artistTopName);
            if (tracks && tracks.length > 0) {
              const ok = await playTracksInOrder(tracks.map(t => t.uri));
              if (ok) {
                directResponse = spotifyCard(
                  { type: "artist_tracks", artistName: tracks[0].artistName, playing: true, tracks },
                  loc(
                    `Ich spiele jetzt die Top-Songs von ${tracks[0].artistName}! Alle ${tracks.length} Tracks laufen nacheinander.`,
                    `Now playing top songs by ${tracks[0].artistName}! All ${tracks.length} tracks will play in order.`
                  )
                );
              } else {
                directResponse = loc(
                  `Ich konnte die Top-Songs von "${artistTopName}" nicht abspielen. Stelle sicher, dass Spotify auf einem Gerät geöffnet ist.`,
                  `Couldn't play "${artistTopName}"'s top tracks. Make sure Spotify is open on a device.`
                );
              }
            } else {
              directResponse = loc(
                `Ich konnte keinen Künstler namens "${artistTopName}" auf Spotify finden.`,
                `I couldn't find an artist called "${artistTopName}" on Spotify.`
              );
            }

          // ── Artist "something from" ──────────────────────────────────────
          } else if (artistFromName) {
            const tracks = await getArtistTopTracks(artistFromName);
            if (tracks && tracks.length > 0) {
              const ok = await playTracksInOrder(tracks.map(t => t.uri));
              if (ok) {
                directResponse = spotifyCard(
                  { type: "artist_tracks", artistName: tracks[0].artistName, playing: true, tracks },
                  loc(
                    `Ich spiele Songs von ${tracks[0].artistName}! Weitere Songs folgen automatisch.`,
                    `Playing songs by ${tracks[0].artistName}! More songs will follow automatically.`
                  )
                );
              } else {
                directResponse = loc(
                  `Ich konnte keinen Song von "${artistFromName}" abspielen. Stelle sicher, dass Spotify aktiv ist.`,
                  `Couldn't play a song from "${artistFromName}". Make sure Spotify is active.`
                );
              }
            } else {
              directResponse = loc(
                `Ich konnte keinen Künstler namens "${artistFromName}" auf Spotify finden.`,
                `I couldn't find an artist called "${artistFromName}" on Spotify.`
              );
            }

          // ── List playlists ───────────────────────────────────────────────
          } else if (isPlaylistList) {
            console.log("[Chat] Playlist list intent");
            const playlists = await getUserPlaylists();
            if (playlists && playlists.length > 0) {
              directResponse = spotifyCard(
                { type: "playlists", items: playlists },
                loc(
                  `Hier sind deine ${playlists.length} Spotify-Playlists! Klicke auf Play um eine zu starten, oder sag "spiel meine [Name] Playlist".`,
                  `Here are your ${playlists.length} Spotify playlists! Click Play to start one, or say "play my [name] playlist".`
                )
              );
            } else {
              directResponse = loc(
                "Ich konnte keine Playlists auf deinem Spotify-Konto finden.",
                "I couldn't find any playlists on your Spotify account."
              );
            }

          // ── Play playlist ────────────────────────────────────────────────
          } else if (playlistPlayMatch) {
            const playlistName = (playlistPlayMatch[1] || "")
              .replace(/\b(my|meine[nm]?|mir|bitte|please)\b/gi, "").trim();
            console.log("[Chat] Playlist play intent, name:", playlistName);
            const playlists = await getUserPlaylists();
            const found = playlists?.find(p =>
              p.name.toLowerCase().includes(playlistName.toLowerCase()) ||
              playlistName.toLowerCase().includes(p.name.toLowerCase())
            );
            if (found) {
              // Try context play first; fall back to loading tracks individually
              let ok = await playContext(found.uri);
              if (!ok) {
                console.log("[Chat] Context play failed, falling back to track-by-track");
                const tracks = await getPlaylistTracks(found.id, 30);
                if (tracks && tracks.length > 0) {
                  ok = await playTracksInOrder(tracks.map(t => t.uri));
                }
              }
              directResponse = ok
                ? loc(
                    `Ich spiele jetzt deine "${found.name}" Playlist!`,
                    `Playing your "${found.name}" playlist now!`
                  )
                : loc(
                    `Konnte die Playlist nicht starten — stelle sicher, dass Spotify auf einem Gerät aktiv ist.`,
                    `Couldn't start the playlist — make sure Spotify is active on a device.`
                  );
            } else {
              directResponse = loc(
                `Ich konnte keine Playlist namens "${playlistName}" finden. Sag "zeig meine Playlists" um alle anzuzeigen.`,
                `I couldn't find a playlist called "${playlistName}". Say "show my playlists" to see all of them.`
              );
            }

          // ── Show queue ───────────────────────────────────────────────────
          } else if (isQueueShow) {
            console.log("[Chat] Queue show intent");
            const queue = await getQueue();
            if (queue) {
              const hasContent = queue.current || queue.upcoming.length > 0;
              if (hasContent) {
                directResponse = spotifyCard(
                  { type: "queue", current: queue.current, upcoming: queue.upcoming },
                  loc(
                    queue.upcoming.length > 0
                      ? `Hier ist deine aktuelle Warteschlange mit ${queue.upcoming.length} kommenden Songs!`
                      : "Hier ist was gerade läuft — die Warteschlange ist danach leer.",
                    queue.upcoming.length > 0
                      ? `Here's your current queue with ${queue.upcoming.length} upcoming songs!`
                      : "Here's what's playing — the queue is empty after this."
                  )
                );
              } else {
                directResponse = loc(
                  "Gerade läuft nichts auf Spotify. Starte einen Song und frag mich dann nochmal!",
                  "Nothing is playing on Spotify right now. Start a song and ask me again!"
                );
              }
            } else {
              directResponse = loc(
                "Ich konnte die Warteschlange nicht abrufen. Stelle sicher, dass Spotify aktiv ist.",
                "Couldn't fetch the queue. Make sure Spotify is active."
              );
            }

          // ── Add to queue ─────────────────────────────────────────────────
          } else if (queueAddMatch) {
            const queueQuery = (queueAddMatch[1] || "")
              .replace(/\b(mir|bitte|please|for me)\b/gi, "").trim();
            console.log("[Chat] Queue add intent, query:", queueQuery);
            // Support "by/von" artist separator
            const byMatch = queueQuery.match(/^(.+?)\s+(?:by|von|par|de)\s+(.+)$/i);
            const searchQuery = byMatch
              ? `track:"${byMatch[1].trim()}" artist:"${byMatch[2].trim()}"`
              : `track:"${queueQuery}"`;
            const tracks = await searchTracks(searchQuery, 1);
            if (tracks && tracks.length > 0) {
              const ok = await addToQueue(tracks[0].uri);
              directResponse = ok
                ? loc(
                    `"${tracks[0].name}" von ${tracks[0].artistName} wurde zur Warteschlange hinzugefügt!`,
                    `Added "${tracks[0].name}" by ${tracks[0].artistName} to the queue!`
                  )
                : loc(
                    "Konnte nicht zur Warteschlange hinzufügen — stelle sicher, dass Spotify aktiv ist.",
                    "Couldn't add to queue — make sure Spotify is active on a device."
                  );
            } else {
              directResponse = loc(
                `Ich konnte "${queueQuery}" auf Spotify nicht finden.`,
                `I couldn't find "${queueQuery}" on Spotify.`
              );
            }

          // ── Recommendations ──────────────────────────────────────────────
          } else if (isRecommendations) {
            console.log("[Chat] Recommendations intent");
            const nowPlaying = await getNowPlaying() as any;
            if (!nowPlaying?.trackId) {
              directResponse = loc(
                "Es läuft gerade kein Song. Starte einen Song und frag mich dann für Empfehlungen!",
                "Nothing is playing right now. Start a song first and then ask for recommendations!"
              );
            } else {
              const tracks = await getRecommendations(nowPlaying.trackId, nowPlaying.artistId);
              if (tracks && tracks.length > 0) {
                const ok = await playTracksInOrder(tracks.map(t => t.uri));
                if (ok) {
                  directResponse = spotifyCard(
                    { type: "artist_tracks", artistName: "Recommendations", playing: true, tracks },
                    loc(
                      `Basierend auf "${nowPlaying.trackName}" von ${nowPlaying.artistName} habe ich ${tracks.length} ähnliche Songs gefunden und starte sie jetzt!`,
                      `Based on "${nowPlaying.trackName}" by ${nowPlaying.artistName}, I found ${tracks.length} similar songs and queued them up!`
                    )
                  );
                } else {
                  directResponse = loc(
                    "Ich konnte die Empfehlungen nicht abspielen. Stelle sicher, dass Spotify auf einem Gerät aktiv ist.",
                    "Couldn't play the recommendations. Make sure Spotify is active on a device."
                  );
                }
              } else {
                directResponse = loc(
                  "Ich konnte keine Empfehlungen finden. Versuche es nach einem Moment nochmal.",
                  "Couldn't find recommendations right now. Try again in a moment."
                );
              }
            }

          // ── Standard play (single track) ─────────────────────────────────
          } else if (playMatch && !isSkip && !isPrev) {
            const rawQuery = playMatch[1]
              .replace(/\b(for me|please|now|right now|right now please|mir|bitte|jetzt)\b/gi, "")
              .trim();
            // Multilingual "by/von/par/de/di/av" artist separator
            const byMatch = rawQuery.match(/^(.+?)\s+(?:by|von|par|de|di|av)\s+(.+)$/i);
            let query: string;
            if (byMatch) {
              query = `track:"${byMatch[1].trim()}" artist:"${byMatch[2].trim()}"`;
            } else {
              const wordCount = rawQuery.trim().split(/\s+/).length;
              query = wordCount <= 3 ? `track:"${rawQuery}"` : rawQuery;
            }
            console.log("[Chat] Play intent detected, raw:", rawQuery, "→ query:", query);
            // Search for the track first so we can build a proper URI list
            const foundTracks = await searchTracks(query, 1);
            if (foundTracks && foundTracks.length > 0) {
              const mainTrack = foundTracks[0];
              // Get artist top tracks to build a sequential context (so "next" works)
              let allTracks = [mainTrack];
              try {
                const firstArtist = mainTrack.artistName.split(",")[0].trim();
                const artistTracks = await getArtistTopTracks(firstArtist);
                if (artistTracks && artistTracks.length > 1) {
                  const extras = artistTracks.filter(t => t.uri !== mainTrack.uri).slice(0, 9);
                  allTracks = [mainTrack, ...extras];
                }
              } catch { /* non-fatal */ }
              const ok = await playTracksInOrder(allTracks.map(t => t.uri));
              if (ok) {
                directResponse = spotifyCard(
                  { type: "artist_tracks", artistName: mainTrack.artistName, playing: true, tracks: allTracks },
                  loc(
                    `Ich spiele jetzt "${mainTrack.name}" von ${mainTrack.artistName}!${allTracks.length > 1 ? ` ${allTracks.length - 1} weitere Songs folgen danach.` : ""}`,
                    `Playing "${mainTrack.name}" by ${mainTrack.artistName} now!${allTracks.length > 1 ? ` ${allTracks.length - 1} more songs follow after.` : ""}`
                  )
                );
              } else {
                directResponse = loc(
                  `Ich konnte das nicht abspielen. Stelle sicher, dass Spotify geöffnet ist.`,
                  `Couldn't play that. Make sure Spotify is open and connected.`
                );
              }
            } else {
              directResponse = loc(
                `Ich konnte "${rawQuery}" auf Spotify nicht finden.`,
                `I couldn't find "${rawQuery}" on Spotify.`
              );
            }

          // ── Playback controls ─────────────────────────────────────────────
          } else if (isSkip) {
            const ok = await playerAction("next");
            directResponse = ok
              ? loc("Übersprungen! Genieße den nächsten Track.", "Skipped! Enjoy the next track.")
              : loc("Konnte nicht überspringen — stelle sicher, dass Spotify aktiv ist.", "Couldn't skip — make sure Spotify is active on a device.");
          } else if (isPrev) {
            const ok = await playerAction("previous");
            directResponse = ok
              ? loc("Zurück zum vorherigen Track.", "Went back to the previous track.")
              : loc("Konnte nicht zurückgehen — stelle sicher, dass Spotify aktiv ist.", "Couldn't go back — make sure Spotify is active.");
          } else if (isPause) {
            const ok = await playerAction("pause");
            directResponse = ok
              ? loc("Pausiert.", "Paused.")
              : loc("Konnte nicht pausieren — stelle sicher, dass Spotify aktiv ist.", "Couldn't pause — make sure Spotify is active.");
          } else if (isResume) {
            const ok = await playerAction("play");
            directResponse = ok
              ? loc("Fortgesetzt!", "Resumed!")
              : loc("Konnte nicht fortsetzen — stelle sicher, dass Spotify aktiv ist.", "Couldn't resume — make sure Spotify is active.");
          }

          if (!directResponse) {
            const nowPlaying = await getNowPlaying();
            if (nowPlaying) {
              const np = nowPlaying as { trackName: string; artistName: string; isPlaying: boolean };
              systemPrompt += `\n\nThe user is currently ${np.isPlaying ? "listening to" : "paused on"} "${np.trackName}" by ${np.artistName} on Spotify.`;
            }
          }
        }
      } catch (spotifyErr) {
        console.error("[Chat] Spotify block error:", spotifyErr);
      }

      // ── Build messages with language priming ──────────────────────────────────
      let aiContent: string;

      if (directResponse) {
        aiContent = directResponse;
      } else {
        // Inject assistant priming right before the last user message — most reliable way
        // to force the model to continue in the detected language
        const msgs: ChatMsg[] = [{ role: "system", content: systemPrompt }, ...historyMessages];

        if (detectedLang && LANG_PRIMERS[detectedLang] && msgs.length >= 2) {
          const lastMsg = msgs.pop()!; // remove last user message
          msgs.push({ role: "assistant", content: LANG_PRIMERS[detectedLang] }); // prime
          msgs.push(lastMsg); // re-add user message after primer
        }

        aiContent =
          (await chatCompletion(msgs, 1024)) ||
          "I'm sorry, I couldn't generate a response.";
      }

      // ── Extract and save any notes_update blocks the AI emitted ──────────────
      const notesMatch = aiContent.match(/<notes_update>([\s\S]*?)<\/notes_update>/);
      if (notesMatch && isOwner) {
        await storage.setOwnerNotes(notesMatch[1].trim());
        aiContent = aiContent.replace(/<notes_update>[\s\S]*?<\/notes_update>/g, "").trim();
      }

      const assistantMessage = await storage.addMessage(convId, {
        role: "assistant",
        content: aiContent,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      });

      if (updatedConversation && updatedConversation.messages.length === 1) {
        const title = await generateTitle(content);
        await storage.updateConversationTitle(convId, title);
      }

      const finalConversation = await storage.getConversation(convId);

      res.json({ conversationId: convId, assistantMessage, conversation: finalConversation });
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.errors });
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Chat error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
