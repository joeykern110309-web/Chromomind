import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Search, Check, X, Zap, PanelLeftClose, PanelLeftOpen, Info, Maximize, Minimize } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChatMessage from "@/components/ChatMessage";
import ConversationCard from "@/components/ConversationCard";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import EmptyState from "@/components/EmptyState";
import SettingsDialog from "@/components/SettingsDialog";
import SpotifyPlayer from "@/components/SpotifyPlayer";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import type { Conversation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const { t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    localStorage.setItem("chromomind-fullscreen", "1");
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) document.exitFullscreen();
    else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    localStorage.removeItem("chromomind-fullscreen");
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) exitFullscreen(); else enterFullscreen();
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const onChange = () => {
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);

    // Auto-enter on first interaction if user had it on before
    if (localStorage.getItem("chromomind-fullscreen") === "1") {
      const onFirstInteraction = () => {
        enterFullscreen();
        document.removeEventListener("click", onFirstInteraction);
        document.removeEventListener("keydown", onFirstInteraction);
      };
      document.addEventListener("click", onFirstInteraction, { once: true });
      document.addEventListener("keydown", onFirstInteraction, { once: true });
    }

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [enterFullscreen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("spotify");
    if (s === "connected") {
      toast({ title: "Spotify connected!", description: "Your account is now linked." });
      window.history.replaceState({}, "", "/");
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
    } else if (s === "error") {
      toast({ title: "Spotify connection failed", description: "Check your credentials.", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    } else if (s === "not-configured") {
      toast({ title: "Spotify not configured", description: "Enter your credentials first.", variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({ queryKey: ["/api/conversations"] });

  const { data: activeConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }); setEditingId(null); },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (payload: { conversationId?: string; content: string }) => apiRequest("POST", "/api/chat", payload),
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
      toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
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
    const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
    const diffD = Math.floor(diffH / 24);
    if (diffH < 1) return t("justNow");
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return t("yesterday");
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex bg-background overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar"
      >
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-sidebar-border space-y-3">
          {/* Branding row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center glow-sm">
                <Zap className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">{t("appName")}</span>
            </div>

            <div className="flex items-center gap-0.5">
              {/* Info button */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="w-7 h-7" data-testid="button-info">
                    <Info className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center glow-sm">
                        <Zap className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
                      </div>
                      {t("appName")}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-1">
                    <p className="text-sm text-muted-foreground leading-relaxed">{t("infoDescription")}</p>
                    <div className="space-y-0 text-sm">
                      <div className="flex justify-between py-2.5 border-b border-border">
                        <span className="text-muted-foreground">{t("infoMadeBy")}</span>
                        <span className="font-semibold text-foreground">Joey Kern</span>
                      </div>
                      <div className="flex justify-between py-2.5 border-b border-border">
                        <span className="text-muted-foreground">{t("infoAiModels")}</span>
                        <span className="font-medium text-foreground">Groq · OpenAI</span>
                      </div>
                      <div className="flex justify-between py-2.5 border-b border-border">
                        <span className="text-muted-foreground">{t("infoMusic")}</span>
                        <span className="font-medium text-foreground">Spotify</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-muted-foreground">{t("infoLanguages")}</span>
                        <span className="font-medium text-foreground">EN · DE · FR · ES · IT</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center pt-1">{t("infoBuiltWith")}</p>
                  </div>
                </DialogContent>
              </Dialog>

              <Button size="icon" variant="ghost" className="w-7 h-7 lg:hidden" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <Button className="w-full justify-start gap-2 text-xs h-8" onClick={() => setActiveConversationId(null)} data-testid="button-new-conversation">
            <Plus className="w-3.5 h-3.5" />
            {t("newChat")}
          </Button>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={t("search")}
              className="pl-8 h-7 text-xs bg-sidebar-accent border-sidebar-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {loadingConversations && (
            <div className="space-y-1 p-1">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-sidebar-accent animate-pulse" />)}
            </div>
          )}
          {!loadingConversations && filteredConversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-10">
              {searchQuery ? t("noMatches") : t("noChats")}
            </p>
          )}
          {filteredConversations.map((conv) => (
            <div key={conv.id}>
              {editingId === conv.id ? (
                <div className="flex items-center gap-1 p-2 rounded-lg bg-sidebar-accent">
                  <Input
                    autoFocus value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRename(conv.id); if (e.key === "Escape") setEditingId(null); }}
                    className="h-6 text-xs bg-background border-input"
                    data-testid={`input-rename-${conv.id}`}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => submitRename(conv.id)} data-testid={`button-confirm-rename-${conv.id}`}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => setEditingId(null)} data-testid={`button-cancel-rename-${conv.id}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <ConversationCard
                  id={conv.id}
                  title={conv.title}
                  preview={conv.messages[conv.messages.length - 1]?.content || t("noMessages")}
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
      </aside>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-background/80 backdrop-blur-xl border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button size="icon" variant="ghost" onClick={() => setSidebarOpen((v) => !v)} data-testid="button-toggle-sidebar">
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </Button>
            <span className="text-sm font-semibold truncate text-foreground/80">
              {activeConversation ? activeConversation.title : t("newChat")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFullscreen}
              data-testid="button-fullscreen"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen
                ? <Minimize className="w-4 h-4" />
                : <Maximize className="w-4 h-4" />}
            </Button>
            <SettingsDialog />
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          {/* Ambient depth layer — always present */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute -top-20 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.055]"
              style={{ background: "hsl(var(--primary))", filter: "blur(90px)" }}
            />
            <div
              className="absolute bottom-1/3 -left-20 w-72 h-72 rounded-full opacity-[0.035]"
              style={{ background: "hsl(var(--primary))", filter: "blur(70px)" }}
            />
            {/* Very faint dot grid */}
            <div
              className="absolute inset-0 opacity-[0.018]"
              style={{
                backgroundImage: "radial-gradient(hsl(var(--primary)) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
          </div>

          {!activeConversation || activeConversation.messages.length === 0
            ? <EmptyState onPromptClick={handleSend} />
            : (
              <div className="relative max-w-3xl mx-auto px-4 pt-8 pb-2">
                {activeConversation.messages.map((msg) => (
                  <ChatMessage key={msg.id} role={msg.role as "user" | "assistant"} content={msg.content} timestamp={msg.timestamp} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )
          }
        </main>

        <ChatInput onSend={handleSend} disabled={isTyping || sendMessageMutation.isPending} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} data-testid="sidebar-overlay" />
      )}
    </div>
  );
}
