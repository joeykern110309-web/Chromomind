import fs from "fs";
import path from "path";
import { type User, type InsertUser, type Conversation, type Message } from "@shared/schema";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSpotifyToken(userId: string, refreshToken: string | null): Promise<void>;
  getUserSpotifyToken(userId: string): Promise<string | null>;

  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(title: string, userId: string): Promise<Conversation>;
  updateConversationTitle(id: string, title: string): Promise<Conversation | undefined>;
  addMessage(conversationId: string, message: Omit<Message, "id">): Promise<Message>;
  deleteConversation(id: string): Promise<boolean>;
}

export class FileStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private conversations: Map<string, Conversation & { userId?: string }> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (data.users) this.users = new Map(Object.entries(data.users) as [string, User][]);
      if (data.conversations) this.conversations = new Map(Object.entries(data.conversations) as [string, any][]);
    } catch { /* first run */ }
  }

  private persist() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        users: Object.fromEntries(this.users),
        conversations: Object.fromEntries(this.conversations),
      }));
    } catch (e) {
      console.error("[Storage] Persist failed:", e);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = (insertUser as any).id ?? randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password ?? "",
      displayName: insertUser.displayName ?? null,
      avatar: insertUser.avatar ?? null,
      spotifyRefreshToken: (insertUser as any).spotifyRefreshToken ?? null,
    };
    this.users.set(id, user);
    this.persist();
    return user;
  }

  async updateUserSpotifyToken(userId: string, refreshToken: string | null): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, spotifyRefreshToken: refreshToken });
    this.persist();
  }

  async getUserSpotifyToken(userId: string): Promise<string | null> {
    return this.users.get(userId)?.spotifyRefreshToken ?? null;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((c) => (c as any).userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(title: string, userId: string): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conv = { id, userId, title, messages: [], createdAt: now, updatedAt: now } as Conversation & { userId: string };
    this.conversations.set(id, conv);
    this.persist();
    return conv;
  }

  async updateConversationTitle(id: string, title: string): Promise<Conversation | undefined> {
    const conv = this.conversations.get(id);
    if (!conv) return undefined;
    const updated = { ...conv, title, updatedAt: new Date().toISOString() };
    this.conversations.set(id, updated);
    this.persist();
    return updated;
  }

  async addMessage(conversationId: string, message: Omit<Message, "id">): Promise<Message> {
    const conv = this.conversations.get(conversationId);
    if (!conv) throw new Error("Conversation not found");
    const newMessage: Message = { ...message, id: randomUUID() };
    const updated = { ...conv, messages: [...conv.messages, newMessage], updatedAt: new Date().toISOString() };
    this.conversations.set(conversationId, updated);
    this.persist();
    return newMessage;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const deleted = this.conversations.delete(id);
    if (deleted) this.persist();
    return deleted;
  }
}

export const storage = new FileStorage();
