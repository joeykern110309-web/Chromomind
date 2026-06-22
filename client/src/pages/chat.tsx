import { useState, useRef, useEffect } from "react";
import { Plus, PanelLeftClose, PanelLeftOpen, Search, Check, X, Zap } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChatMessage from "@/components/ChatMessage";
import ConversationCard from "@/components/ConversationCard";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import EmptyState from "@/components/EmptyState";
import ThemeToggle from "@/components/ThemeToggle";
import SpotifyPlayer from "@/components/SpotifyPlayer";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import type { Conversation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyStatus = params.get("spotify");
    if (spotifyStatus === "connected") {
      toast({ title: "Spotify connected!", description: "Your Spotify account is now linked." });
      window.history.replaceState({}, "", "/");
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
    } else if (spotifyStatus === "error") {
      toast({ title: "Spotify connection failed", description: "Check your Client ID, Secret and Redirect URI.", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    } else if (spotifyStatus === "not-configured") {
      toast({ title: "Spotify not configured", description: "Click the gear icon and enter your credentials first.", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: activeConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
  });

  const createConversationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/conversations"),
    onSuccess: async (res) => {
      const conv = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversationId(conv.id);
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/conversations/${id}`),
    onSuccess: (_res, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversationId === deletedId) {
        const remaining = conversations.filter((c) => c.id !== deletedId);
        setActiveConversationId(remaining[0]?.id || null);
      }
    },
  });

  const renameConversationMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest("PATCH", `/api/conversations/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditingId(null);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (payload: { conversationId?: string; content: string }) =>
      apiRequest("POST", "/api/chat", payload),
    onMutate: () => setIsTyping(true),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.setQueryData(["/api/conversations", data.conversationId], data.conversation);
      if (!activeConversationId) setActiveConversationId(data.conversationId);
      setIsTyping(false);
    },
    onError: () => {
      setIsTyping(false);
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, isTyping]);

  const handleSend = (content: string) => {
    sendMessageMutation.mutate({ conversationId: activeConversationId ?? undefined, content });

    if (activeConversationId) {
      const optimistic: Conversation = {
        ...(activeConversation!),
        messages: [
          ...(activeConversation?.messages || []),
          {
            id: "temp-" + Date.now(),
            role: "user",
            content,
            timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          },
        ],
      };
      queryClient.setQueryData(["/api/conversations", activeConversationId], optimistic);
    }
  };

  const startEditing = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const submitRename = (id: string) => {
    if (editTitle.trim()) renameConversationMutation.mutate({ id, title: editTitle.trim() });
    else setEditingId(null);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimestamp = (conv: Conversation) => {
    const d = new Date(conv.updatedAt);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
    const diffD = Math.floor(diffH / 24);
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 lg:relative lg:translate-x-0 flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar"
      >
        {/* Sidebar header */}
        <div className="p-4 space-y-3 border-b border-sidebar-border flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center glow-sm">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">AI Chat</span>
            </div>
            <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Button
            className="w-full justify-start gap-2 text-sm"
            onClick={() => setActiveConversationId(null)}
            data-testid="button-new-conversation"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-9 bg-sidebar-accent border-sidebar-border text-sm h-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingConversations && (
            <div className="space-y-1 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-md bg-sidebar-accent animate-pulse" />
              ))}
            </div>
          )}

          {!loadingConversations && filteredConversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-10 px-4">
              {searchQuery ? "No matches found" : "No conversations yet"}
            </p>
          )}

          {filteredConversations.map((conv) => (
            <div key={conv.id} className="group/item relative">
              {editingId === conv.id ? (
                <div className="flex items-center gap-1 p-2 rounded-md bg-sidebar-accent">
                  <Input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(conv.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 text-xs bg-background border-input"
                    data-testid={`input-rename-${conv.id}`}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => submitRename(conv.id)} data-testid={`button-confirm-rename-${conv.id}`}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => setEditingId(null)} data-testid={`button-cancel-rename-${conv.id}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <ConversationCard
                  id={conv.id}
                  title={conv.title}
                  preview={conv.messages[conv.messages.length - 1]?.content || "No messages yet"}
                  timestamp={getTimestamp(conv)}
                  isActive={activeConversationId === conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  onDelete={() => deleteConversationMutation.mutate(conv.id)}
                  onRename={(e) => startEditing(conv, e)}
                />
              )}
            </div>
          ))}
        </div>

        <SpotifyPlayer />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/90 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              size="icon"
              variant="ghost"
              className="flex-shrink-0"
              onClick={() => setSidebarOpen((v) => !v)}
              data-testid="button-toggle-sidebar"
            >
              {sidebarOpen
                ? <PanelLeftClose className="w-5 h-5" />
                : <PanelLeftOpen className="w-5 h-5" />
              }
            </Button>
            {activeConversation ? (
              <h1 className="text-sm font-semibold text-foreground truncate">
                {activeConversation.title}
              </h1>
            ) : (
              <h1 className="text-sm font-semibold text-muted-foreground">New Chat</h1>
            )}
          </div>
          <ThemeToggle />
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <EmptyState onPromptClick={handleSend} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6">
              {activeConversation.messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <ChatInput
          onSend={handleSend}
          disabled={isTyping || sendMessageMutation.isPending}
          placeholder="Message..."
        />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}
    </div>
  );
}
