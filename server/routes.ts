import type { Express } from "express";
import { createServer, type Server } from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "./storage";
import { sendMessageSchema, renameConversationSchema } from "@shared/schema";
import { ZodError } from "zod";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(
      `Generate a short, descriptive title (4-6 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or punctuation: "${firstMessage.slice(0, 200)}"`
    );
    return result.response.text().trim() || "New Conversation";
  } catch {
    return firstMessage.slice(0, 50);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
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
      const history = (updatedConversation?.messages || []).slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: SYSTEM_PROMPT,
      });

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(content);
      const aiContent = result.response.text() || "I'm sorry, I couldn't generate a response.";

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
