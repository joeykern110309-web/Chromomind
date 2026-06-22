import type { Express } from "express";
import { createServer, type Server } from "http";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// Provider fallback chain: Groq → OpenAI → Gemini.
// Whichever provider has available quota will answer.
// `light` uses smaller, cheaper models (e.g. for title generation) to conserve tokens.
async function chatCompletion(messages: ChatMsg[], maxTokens: number, light = false): Promise<string> {
  // 1. Groq
  try {
    const response = await groq.chat.completions.create({
      model: light ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile",
      messages,
      max_tokens: maxTokens,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    console.error("[AI] Groq failed, trying OpenAI:", err?.status || err?.message);
  }

  // 2. OpenAI
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    console.error("[AI] OpenAI failed, trying Gemini:", err?.status || err?.message);
  }

  // 3. Gemini — convert chat messages into a single prompt with system instruction
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const model = gemini.getGenerativeModel({
    model: "gemini-2.0-flash",
    ...(systemMsg ? { systemInstruction: systemMsg } : {}),
  });
  const result = await model.generateContent(convo || "Hello");
  return result.response.text().trim() || "";
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

      // ── Detect Spotify intent and handle directly (no AI for music commands) ─
      let directResponse: string | null = null;
      let systemPrompt = SYSTEM_PROMPT;

      try {
        const status = await getStatus();
        if (status.connected) {
          const msg = content.toLowerCase();

          const playMatch = msg.match(/(?:^|\s)(?:play|put on|queue|listen to|start playing)\s+(.+)/i);
          const isSkip   = /\b(skip|next( song| track)?)\b/.test(msg);
          const isPrev   = /\b(previous|prev|go back|last song)\b/.test(msg);
          const isPause  = /\b(pause|stop(?: the music| playing)?)\b/.test(msg) && !playMatch;
          const isResume = /\b(resume|unpause|continue playing|play again)\b/.test(msg);

          if (playMatch && !isSkip && !isPrev) {
            const rawQuery = playMatch[1].replace(/\b(for me|please|now|right now)\b/gi, "").trim();
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
