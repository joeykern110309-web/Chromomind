import type { Express } from "express";
import { createServer, type Server } from "http";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { storage } from "./storage";
import { sendMessageSchema, renameConversationSchema } from "@shared/schema";
import { ZodError } from "zod";
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

// Build a list of Groq clients from all available GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 …
const groqClients: Groq[] = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
]
  .filter(Boolean)
  .map((key) => new Groq({ apiKey: key as string }));

// Replit-managed AI — OpenAI-compatible fallback when all Groq keys are exhausted.
const replitAI = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// Try each Groq key in sequence; if all fail, fall back to Replit AI.
// `light` uses a smaller model (for title generation) to conserve tokens.
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

  // All Groq keys exhausted — fall back to Replit AI
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

// Detect the language of the user's message and return a language name, or null for English
function detectLanguage(text: string): string | null {
  const t = text.toLowerCase();
  const de = /[äöüß]|\b(ich|du|er|sie|wir|ihr|ist|bin|bist|sind|haben|hat|habe|und|oder|aber|nicht|das|die|der|ein|eine|auch|noch|kein|beim|bitte|danke|hallo|ja|nein|gut|sehr|macht|kannst|können|musst|willst|doch|mal|halt|echt|schon|gerade|jetzt|immer|immer|nichts|alles|weil|wenn|dass|wie|was|wer|wo|warum|spiel|spielen|überspringen|nächste|nächstes|vorherige|anhalten|fortsetzen|musik|lied|song)\b/.test(t);
  const fr = /\b(je|tu|il|elle|nous|vous|ils|elles|est|sont|et|ou|mais|pas|ne|le|la|les|un|une|des|du|bonjour|merci|oui|non|très|bien|comment|pourquoi|que|qui|où|quoi|jouer|écouter|passer|arrêter)\b/.test(t);
  const es = /\b(yo|tú|él|ella|nosotros|vosotros|ellos|ellas|es|son|estar|ser|y|o|pero|no|el|la|los|las|un|una|del|que|en|con|por|para|hola|gracias|sí|bueno|bien|cómo|qué|quién|dónde|reproducir|escuchar|parar)\b/.test(t);
  const pt = /\b(eu|tu|ele|ela|nós|vós|eles|elas|está|são|e|ou|mas|não|o|a|os|as|um|uma|dos|das|que|em|com|por|para|olá|obrigado|sim|não|bom|bem|como|por que|quem|onde|tocar|ouvir|parar)\b/.test(t);
  const it = /\b(io|tu|lui|lei|noi|voi|loro|è|sono|e|o|ma|non|il|la|i|le|un|una|dei|delle|che|in|con|per|ciao|grazie|sì|no|buono|bene|come|perché|chi|dove|suona|ascolta|ferma)\b/.test(t);
  if (de) return "German";
  if (fr) return "French";
  if (es) return "Spanish";
  if (pt) return "Portuguese";
  if (it) return "Italian";
  return null;
}

async function generateTitle(firstMessage: string): Promise<string> {
  try {
    const title = await chatCompletion(
      [
        {
          role: "user",
          content: `Generate a short, descriptive title (4-6 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or punctuation: "${firstMessage.slice(0, 200)}"`,
        },
      ],
      20,
      true,
    );
    return title || "New Conversation";
  } catch {
    return firstMessage.slice(0, 50);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ── Spotify Config ─────────────────────────────────────────────────────────
  app.get("/api/spotify/config", (_req, res) => {
    res.json(getConfig());
  });
  app.post("/api/spotify/config", (req, res) => {
    const { clientId, clientSecret, redirectUri } = req.body;
    updateConfig({
      ...(clientId !== undefined ? { clientId } : {}),
      ...(clientSecret !== undefined ? { clientSecret } : {}),
      ...(redirectUri !== undefined ? { redirectUri } : {}),
    });
    res.json({ success: true });
  });

  // ── Spotify OAuth ──────────────────────────────────────────────────────────
  app.get("/api/spotify/login", handleLogin);
  app.get("/api/spotify/callback", handleCallback);
  app.get("/api/spotify/status", async (_req, res) => {
    try {
      const status = await getStatus();
      res.json(status);
    } catch {
      res.status(500).json({ error: "Failed to get Spotify status" });
    }
  });
  app.get("/api/spotify/now-playing", async (_req, res) => {
    try {
      const nowPlaying = await getNowPlaying();
      res.json({ nowPlaying });
    } catch {
      res.status(500).json({ error: "Failed to get now playing" });
    }
  });
  app.post("/api/spotify/player/:action", async (req, res) => {
    try {
      const ok = await playerAction(req.params.action);
      res.json({ success: ok });
    } catch {
      res.status(500).json({ error: "Player action failed" });
    }
  });
  app.post("/api/spotify/disconnect", (_req, res) => {
    disconnect();
    setSdkDeviceId(null);
    res.json({ success: true });
  });

  // Expose access token for the Web Playback SDK (browser-side)
  app.get("/api/spotify/sdk-token", async (_req, res) => {
    const token = await getAccessTokenForSdk();
    if (!token) return res.status(401).json({ error: "Not connected" });
    res.json({ accessToken: token });
  });

  // Browser registers its SDK device_id here
  app.post("/api/spotify/device", (req, res) => {
    const { deviceId } = req.body as { deviceId: string };
    if (deviceId) {
      setSdkDeviceId(deviceId);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "deviceId required" });
    }
  });

  // ── Conversations ──────────────────────────────────────────────────────────
  app.get("/api/conversations", async (_req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      res.json(conversation);
    } catch {
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (_req, res) => {
    try {
      const conversation = await storage.createConversation("New Conversation");
      res.json(conversation);
    } catch {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.patch("/api/conversations/:id", async (req, res) => {
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

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteConversation(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Conversation not found" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // ── Chat ───────────────────────────────────────────────────────────────────
  app.post("/api/chat", async (req, res) => {
    try {
      const { conversationId, content } = sendMessageSchema.parse(req.body);

      let convId = conversationId;
      let conversation;

      if (!convId) {
        conversation = await storage.createConversation("New Conversation");
        convId = conversation.id;
      } else {
        conversation = await storage.getConversation(convId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      }

      const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      await storage.addMessage(convId, { role: "user", content, timestamp: now });

      const updatedConversation = await storage.getConversation(convId);
      const historyMessages = (updatedConversation?.messages || []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      // ── Language detection — inject explicit instruction per request ──────────
      const detectedLang = detectLanguage(content);
      let systemPrompt = detectedLang
        ? `MANDATORY: You are speaking with someone who writes in ${detectedLang}. You MUST reply ONLY in ${detectedLang}. Do not use English or any other language under any circumstances.\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT;

      // ── Detect Spotify intent and handle directly (no AI for music commands) ─
      let directResponse: string | null = null;

      try {
        const status = await getStatus();
        if (status.connected) {
          const msg = content.toLowerCase();

          // Try multiple play phrasings in order of specificity (EN + DE + FR + ES)
          const PLAY_PATTERNS = [
            /(?:^|\s)(?:play\s+me|put\s+on|queue|start\s+playing)\s+(.+)/i,
            /(?:^|\s)(?:can|could|would)\s+you\s+play\s+(.+)/i,
            /(?:^|\s)i(?:'d)?\s+(?:want|like|love)\s+to\s+(?:hear|listen\s+to|play)\s+(.+)/i,
            /(?:^|\s)i\s+wanna\s+(?:hear|listen\s+to)\s+(.+)/i,
            /(?:^|\s)listen\s+to\s+(.+)/i,
            // German: "spiel [mir] X", "spiele X"
            /(?:^|\s)spiel(?:e)?\s+(?:mir\s+)?(.+)/i,
            // German: "leg X auf"
            /(?:^|\s)leg\s+(.+?)\s+auf(?:\s|$)/i,
            // German: "ich will/möchte X hören"
            /(?:^|\s)ich\s+(?:will|möchte|würde\s+gern)\s+(?:gern\s+)?(.+?)\s+hören/i,
            // French: "joue X", "mets X"
            /(?:^|\s)(?:joue|mets|lance)\s+(?:moi\s+)?(.+)/i,
            // Spanish: "pon X", "reproduce X"
            /(?:^|\s)(?:pon|reproduce|toca)\s+(.+)/i,
            // plain "play X" — last priority
            /(?:^|\s)play\s+(.+)/i,
          ];
          let playMatch: RegExpMatchArray | null = null;
          for (const pattern of PLAY_PATTERNS) {
            playMatch = msg.match(pattern);
            if (playMatch) break;
          }

          const isSkip   = /\b(skip|next( song| track)?|überspringen|nächste[rns]?\s+(?:song|lied|titel|track)|weiter(?:springen)?|passer|suivant|siguiente)\b/.test(msg);
          const isPrev   = /\b(previous|prev|go back|last song|vorherige[rns]?\s+(?:song|lied|titel|track)|zurück|précédent|anterior)\b/.test(msg);
          const isPause  = /\b(pause|stop(?: the music| playing)?|pausieren|anhalten|pausa|arrêter)\b/.test(msg) && !playMatch;
          const isResume = /\b(resume|unpause|continue playing|play again|weiterspielen|fortsetzen|reprendre|reanudar)\b/.test(msg);

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
            // Not a music command — inject now-playing context for regular chat
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

      // If it was a music command, skip the AI and return directly
      let aiContent: string;
      if (directResponse) {
        aiContent = directResponse;
      } else {
        aiContent = await chatCompletion(
          [{ role: "system", content: systemPrompt }, ...historyMessages],
          1024,
        ) || "I'm sorry, I couldn't generate a response.";
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

      res.json({
        conversationId: convId,
        assistantMessage,
        conversation: finalConversation,
      });
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
