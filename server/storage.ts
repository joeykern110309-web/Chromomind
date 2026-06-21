import { type User, type InsertUser, type Conversation, type Message } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(title: string): Promise<Conversation>;
  updateConversationTitle(id: string, title: string): Promise<Conversation | undefined>;
  addMessage(conversationId: string, message: Omit<Message, "id">): Promise<Message>;
  deleteConversation(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private conversations: Map<string, Conversation>;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(title: string): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversationTitle(id: string, title: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    const updated = { ...conversation, title, updatedAt: new Date().toISOString() };
    this.conversations.set(id, updated);
    return updated;
  }

  async addMessage(conversationId: string, message: Omit<Message, "id">): Promise<Message> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const newMessage: Message = { ...message, id: randomUUID() };
    const updated = {
      ...conversation,
      messages: [...conversation.messages, newMessage],
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(conversationId, updated);
    return newMessage;
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.conversations.delete(id);
  }
}

export const storage = new MemStorage();
