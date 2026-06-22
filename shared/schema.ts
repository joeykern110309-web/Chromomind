import { z } from "zod";

// ── User ─────────────────────────────────────────────────────────────────────
export const insertUserSchema = z.object({
  id: z.string().optional(),
  username: z.string(),
  password: z.string().default(""),
  displayName: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = {
  id: string;
  username: string;
  password: string;
  displayName: string | null;
  avatar: string | null;
};

// ── Messages / Conversations ─────────────────────────────────────────────────
export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  title: z.string(),
  messages: z.array(messageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().optional(),
  content: z.string().min(1),
});

export const renameConversationSchema = z.object({
  title: z.string().min(1),
});
