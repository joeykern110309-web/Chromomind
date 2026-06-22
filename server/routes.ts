import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
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
  getAccessTokenForSdk,
  setSdkDeviceId,
} from "./spotify";

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

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = req.user as Express.User;
    res.json({ id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar });
  });

  if (GOOGLE_CONFIGURED) {
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/?auth_error=1" }),
      (_req, res) => res.redirect("/")
    );
  } else {
    app.get("/api/auth/google", (_req, res) => {
      res.status(503).json({ error: "Google auth not configured" });
    });
  }

  app.post("/api/auth/logout", (req: any, res) => {
    req.logout(() => res.json({ success: true }));
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
    res.json({ success: true });
  });

  // ── Spotify OAuth ─────────────────────────────────────────────────────────────
  app.get("/api/spotify/login", handleLogin);
  app.get("/api/spotify/callback", handleCallback);
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
      const userId = (req.user as Express.User).id;

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

      let systemPrompt = detectedLang
        ? `CRITICAL SYSTEM RULE: The user is communicating in ${detectedLang}. You MUST respond ONLY in ${detectedLang}. Using any other language is a violation. Never switch to English.\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT;

      // ── Spotify music intent detection ──────────────────────────────────────
      let directResponse: string | null = null;

      try {
        const msg = content.toLowerCase();

        const PLAY_PATTERNS = [
          /(?:^|\s)(?:play\s+me|put\s+on|queue|start\s+playing)\s+(.+)/i,
          /(?:^|\s)(?:can|could|would)\s+you\s+play\s+(.+)/i,
          /(?:^|\s)i(?:'d)?\s+(?:want|like|love)\s+to\s+(?:hear|listen\s+to|play)\s+(.+)/i,
          /(?:^|\s)i\s+wanna\s+(?:hear|listen\s+to)\s+(.+)/i,
          /(?:^|\s)listen\s+to\s+(.+)/i,
          /(?:^|\s)spiel(?:e)?\s+(?:mir\s+)?(.+)/i,
          /(?:^|\s)leg\s+(.+?)\s+auf(?:\s|$)/i,
          /(?:^|\s)ich\s+(?:will|möchte|würde\s+gern)\s+(?:gern\s+)?(.+?)\s+hören/i,
          /(?:^|\s)(?:joue|mets|lance)\s+(?:moi\s+)?(.+)/i,
          /(?:^|\s)(?:pon|reproduce|toca)\s+(.+)/i,
          /(?:^|\s)play\s+(.+)/i,
        ];

        let playMatch: RegExpMatchArray | null = null;
        for (const pattern of PLAY_PATTERNS) {
          playMatch = msg.match(pattern);
          if (playMatch) break;
        }

        const isSkip   = /\b(skip|next( song| track)?|überspringen|weiter|passer|suivant|siguiente)\b/.test(msg);
        const isPrev   = /\b(previous|prev|go back|last song|zurück|précédent|anterior)\b/.test(msg);
        const isPause  = /\b(pause|stop(?: the music| playing)?|pausieren|anhalten|pausa|arrêter)\b/.test(msg) && !playMatch;
        const isResume = /\b(resume|unpause|continue playing|play again|weiterspielen|fortsetzen|reprendre|reanudar)\b/.test(msg);
        const isMusicCommand = !!(playMatch || isSkip || isPrev || isPause || isResume);

        const status = await getStatus();

        if (isMusicCommand && !status.connected) {
          // Spotify not connected — tell user to log in, in their language
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
          if (playMatch && !isSkip && !isPrev) {
            const rawQuery = playMatch[1]
              .replace(/\b(for me|please|now|right now|right now please)\b/gi, "")
              .trim();
            const byMatch = rawQuery.match(/^(.+?)\s+by\s+(.+)$/i);
            const query = byMatch
              ? `track:${byMatch[1].trim()} artist:${byMatch[2].trim()}`
              : rawQuery;
            console.log("[Chat] Play intent detected, query:", query);
            const result = await searchAndPlay(query);
            if (result.success) {
              directResponse = `Playing "${result.trackName}" by ${result.artistName} now!`;
            } else {
              directResponse = `I couldn't play that — ${result.error}. Make sure Spotify is open and you're connected.`;
            }
          } else if (isSkip) {
            const ok = await playerAction("next");
            directResponse = ok ? "Skipped! Enjoy the next track." : "Couldn't skip — make sure Spotify is active on a device.";
          } else if (isPrev) {
            const ok = await playerAction("previous");
            directResponse = ok ? "Went back to the previous track." : "Couldn't go back — make sure Spotify is active.";
          } else if (isPause) {
            const ok = await playerAction("pause");
            directResponse = ok ? "Paused." : "Couldn't pause — make sure Spotify is active.";
          } else if (isResume) {
            const ok = await playerAction("play");
            directResponse = ok ? "Resumed!" : "Couldn't resume — make sure Spotify is active.";
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
