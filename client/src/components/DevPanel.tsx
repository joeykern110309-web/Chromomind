import { useState, useEffect } from "react";
import { Zap, X, Megaphone, Users, Send, Trash2, Music, MessageSquare, Settings, ChevronUp, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import SpotifySettings from "@/components/SpotifySettings";

interface UserStat {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  conversationCount: number;
  hasSpotify: boolean;
}

interface StatsData {
  userCount: number;
  users: UserStat[];
}

interface Broadcast {
  id: string;
  message: string;
  timestamp: string;
}

type Tab = "broadcast" | "users" | "spotify";

export default function DevPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("broadcast");
  const [message, setMessage] = useState("");
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  if (!user?.isOwner) return null;

  const loadBroadcast = async () => {
    try {
      const res = await fetch("/api/admin/broadcast");
      const data = await res.json();
      setActiveBroadcast(data.broadcast);
    } catch { /* ignore */ }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    finally { setLoadingStats(false); }
  };

  useEffect(() => {
    if (open) {
      loadBroadcast();
      if (tab === "users") loadStats();
    }
  }, [open, tab]);

  const sendBroadcast = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/broadcast", { message });
      const data = await res.json();
      setActiveBroadcast(data.broadcast);
      setMessage("");
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const clearBroadcast = async () => {
    try {
      await apiRequest("DELETE", "/api/admin/broadcast");
      setActiveBroadcast(null);
    } catch { /* ignore */ }
  };

  const initials = (u: UserStat) =>
    u.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ||
    u.username.slice(0, 2).toUpperCase();

  const TABS = [
    ["broadcast", Megaphone, "Broadcast"],
    ["users", Users, "Users"],
    ["spotify", Settings, "Spotify"],
  ] as const;

  return (
    <div className="border-t border-sidebar-border flex-shrink-0">
      {/* Trigger row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover-elevate"
        data-testid="button-dev-panel"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} strokeWidth={2.5} />
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "hsl(var(--primary))" }}>
            Dev Panel
          </span>
          {activeBroadcast && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" style={{ boxShadow: "0 0 6px hsl(var(--primary)/0.8)" }} />
          )}
        </div>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {/* Expandable panel — opens upward within the sidebar */}
      {open && (
        <div
          className="border-t"
          style={{ borderColor: "hsl(var(--primary)/0.15)" }}
        >
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: "hsl(var(--primary)/0.1)" }}>
            {TABS.map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key as Tab)}
                className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors"
                style={{
                  color: tab === key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  borderBottom: tab === key ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
                data-testid={`tab-dev-${key}`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Broadcast */}
          {tab === "broadcast" && (
            <div className="p-3 space-y-3">
              {activeBroadcast && (
                <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: "hsl(var(--primary)/0.08)", border: "1px solid hsl(var(--primary)/0.18)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Active</span>
                    <button
                      onClick={clearBroadcast}
                      className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity text-destructive"
                      data-testid="button-clear-broadcast"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{activeBroadcast.message}</p>
                </div>
              )}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Announcement for all users…"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-xs text-sidebar-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none bg-sidebar-accent border border-sidebar-border"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBroadcast(); } }}
                data-testid="input-broadcast-message"
              />
              <Button
                onClick={sendBroadcast}
                disabled={!message.trim() || sending}
                className="w-full"
                size="sm"
                data-testid="button-send-broadcast"
              >
                <Send className="w-3 h-3 mr-1.5" />
                {sending ? "Sending…" : "Broadcast"}
              </Button>
            </div>
          )}

          {/* Tab: Users */}
          {tab === "users" && (
            <div className="max-h-56 overflow-y-auto">
              {loadingStats ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 rounded-lg bg-sidebar-accent animate-pulse" />
                  ))}
                </div>
              ) : stats ? (
                <div className="p-2 space-y-1">
                  <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {stats.userCount} {stats.userCount === 1 ? "user" : "users"}
                  </p>
                  {stats.users.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-sidebar-accent/50"
                      data-testid={`dev-user-${u.id}`}
                    >
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={u.avatar ?? undefined} />
                        <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-semibold">
                          {initials(u)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-sidebar-foreground truncate">{u.displayName ?? u.username}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{u.username}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {u.hasSpotify && <Music className="w-3 h-3" style={{ color: "#1DB954" }} />}
                        <div className="flex items-center gap-0.5">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{u.conversationCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-xs text-center text-muted-foreground">Failed to load</p>
              )}
            </div>
          )}

          {/* Tab: Spotify */}
          {tab === "spotify" && (
            <div className="p-3">
              <SpotifySettings inDevPanel />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
