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
  const SPOTIFY_TOOLS: Groq.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "spotify_search_play",
        description: "Search for a song, artist, or album on Spotify and play it immediately.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query e.g. 'Blinding Lights The Weeknd' or 'lo-fi beats'" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "spotify_control",
        description: "Control Spotify playback: play, pause, skip to next track, or go to previous track.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["play", "pause", "next", "previous"], description: "The playback action to perform." },
          },
          required: ["action"],
        },
      },
    },
  ];

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

      // Inject Spotify now-playing context
      let systemPrompt = SYSTEM_PROMPT;
      let spotifyConnected = false;
      try {
        const nowPlaying = await getNowPlaying();
        if (nowPlaying) {
          spotifyConnected = true;
          const np = nowPlaying as { trackName: string; artistName: string; albumName: string; isPlaying: boolean };
          systemPrompt += `\n\nSpotify context: The user is currently ${np.isPlaying ? "listening to" : "paused on"} "${np.trackName}" by ${np.artistName} from "${np.albumName}". You can reference this naturally if relevant.`;
        }
        const status = await getStatus();
        if (status.connected) spotifyConnected = true;
      } catch { /* not connected */ }

      systemPrompt += `\n\nYou have access to Spotify tools${spotifyConnected ? " and the user's Spotify is connected" : " but Spotify is not connected"}. Use spotify_search_play when the user asks to play a specific song/artist/genre. Use spotify_control for play, pause, skip, previous. Only call tools when the user clearly wants music control — don't call them for general music discussion.`;

      // First LLM call — may request tool use
      const firstResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
        tools: spotifyConnected ? SPOTIFY_TOOLS : undefined,
        tool_choice: spotifyConnected ? "auto" : undefined,
        max_tokens: 8192,
      });

      const firstChoice = firstResponse.choices[0];
      let aiContent: string;

      if (firstChoice.finish_reason === "tool_calls" && firstChoice.message.tool_calls?.length) {
        // Execute all tool calls
        const toolResults: Groq.Chat.ChatCompletionMessageParam[] = [];

        for (const toolCall of firstChoice.message.tool_calls) {
          let toolResult = "";
          try {
            const args = JSON.parse(toolCall.function.arguments);
            if (toolCall.function.name === "spotify_search_play") {
              const result = await searchAndPlay(args.query);
              toolResult = result.success
                ? `Successfully playing "${result.trackName}" by ${result.artistName}.`
                : `Failed: ${result.error}`;
            } else if (toolCall.function.name === "spotify_control") {
              const ok = await playerAction(args.action);
              toolResult = ok ? `Playback action "${args.action}" completed.` : `Action "${args.action}" failed — make sure Spotify is open on a device.`;
            }
          } catch (e) {
            toolResult = `Tool error: ${String(e)}`;
          }
          toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
        }

        // Second LLM call — generate natural response after tool execution
        const secondResponse = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            firstChoice.message,
            ...toolResults,
          ],
          max_tokens: 1024,
        });
        aiContent = secondResponse.choices[0]?.message?.content || "Done!";
      } else {
        aiContent = firstChoice.message?.content || "I'm sorry, I couldn't generate a response.";
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
      console.error("Chat error:", e);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
