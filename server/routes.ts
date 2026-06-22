import type { Express } from "express";
import { createServer, type Server } from "http";
import Groq from "groq-sdk";
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
} from "./spotify";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

async function generateTitle(firstMessage: string): Promise<string> {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: `Generate a short, descriptive title (4-6 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or punctuation: "${firstMessage.slice(0, 200)}"`,
        },
      ],
      max_tokens: 20,
    });
    return response.choices[0]?.message?.content?.trim() || "New Conversation";
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
    res.json({ success: true });
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

      // ── Detect Spotify intent directly from message ────────────────────────
      let systemPrompt = SYSTEM_PROMPT;
      let spotifyActionNote = "";

      try {
        const status = await getStatus();
        if (status.connected) {
          const msg = content.toLowerCase();

          // Detect play intent: "play X", "put on X", "queue X", "listen to X"
          const playMatch = msg.match(/(?:play|put on|queue|listen to|start playing)\s+(.+)/i);
          // Detect control intents
          const isSkip     = /\b(skip|next( song| track)?)\b/.test(msg);
          const isPrev     = /\b(previous|prev|go back|last song)\b/.test(msg);
          const isPause    = /\b(pause|stop the music|stop playing)\b/.test(msg) && !/play/.test(msg);
          const isResume   = /\b(resume|unpause|continue playing|play again)\b/.test(msg);

          if (playMatch && !isSkip && !isPrev) {
            const query = playMatch[1].replace(/\b(for me|please|now|right now)\b/gi, "").trim();
            const result = await searchAndPlay(query);
            if (result.success) {
              spotifyActionNote = `[Spotify] Now playing "${result.trackName}" by ${result.artistName}.`;
            } else {
              spotifyActionNote = `[Spotify] Couldn't play that: ${result.error}`;
            }
          } else if (isSkip) {
            const ok = await playerAction("next");
            spotifyActionNote = ok ? "[Spotify] Skipped to next track." : "[Spotify] Skip failed — is Spotify open on a device?";
          } else if (isPrev) {
            const ok = await playerAction("previous");
            spotifyActionNote = ok ? "[Spotify] Went back to previous track." : "[Spotify] Previous failed.";
          } else if (isPause) {
            const ok = await playerAction("pause");
            spotifyActionNote = ok ? "[Spotify] Paused." : "[Spotify] Pause failed.";
          } else if (isResume) {
            const ok = await playerAction("play");
            spotifyActionNote = ok ? "[Spotify] Resumed playback." : "[Spotify] Resume failed.";
          }

          // Always inject now-playing context
          const nowPlaying = await getNowPlaying();
          if (nowPlaying) {
            const np = nowPlaying as { trackName: string; artistName: string; albumName: string; isPlaying: boolean };
            systemPrompt += `\n\nSpotify: user is ${np.isPlaying ? "listening to" : "paused on"} "${np.trackName}" by ${np.artistName}.`;
          }

          if (spotifyActionNote) {
            systemPrompt += `\n\nYou just executed a Spotify action: ${spotifyActionNote}. Tell the user naturally what you did in 1-2 sentences.`;
          } else {
            systemPrompt += `\n\nSpotify is connected. You can control music — but you already handled it directly, so just chat normally.`;
          }
        }
      } catch { /* Spotify not connected */ }

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
        max_tokens: 8192,
      });

      let aiContent = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

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
      console.error("Chat error:", e);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
