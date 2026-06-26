import { useState, useEffect } from "react";
import { Zap, X, Megaphone, Users, Send, Trash2, Music, MessageSquare, Settings } from "lucide-react";
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
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-24 right-4 z-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all duration-200"
        style={{
          background: open
            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(199 80% 42%))"
            : "linear-gradient(135deg, hsl(var(--primary)/0.25), hsl(199 80% 42%/0.15))",
          border: "1px solid hsl(var(--primary)/0.4)",
          boxShadow: open ? "0 0 20px hsl(var(--primary)/0.4)" : "0 4px 12px rgba(0,0,0,0.3)",
        }}
        title="Dev Panel"
        data-testid="button-dev-panel"
      >
        <Zap className="w-4 h-4" style={{ color: open ? "white" : "hsl(var(--primary))" }} strokeWidth={2.5} />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-36 right-4 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: "linear-gradient(145deg, hsl(220 20% 10%), hsl(220 20% 8%))",
            border: "1px solid hsl(var(--primary)/0.25)",
            backdropFilter: "blur(20px)",
            animation: "dev-panel-in 0.25s cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "hsl(var(--primary)/0.15)" }}>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} strokeWidth={2.5} />
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "hsl(var(--primary))" }}>Dev Panel</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: "hsl(var(--primary)/0.1)" }}>
            {TABS.map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key as Tab)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: tab === key ? "hsl(var(--primary))" : "rgba(255,255,255,0.4)",
                  borderBottom: tab === key ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
                data-testid={`tab-dev-${key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Broadcast */}
          {tab === "broadcast" && (
            <div className="p-4 space-y-3">
              {activeBroadcast && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.2)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(var(--primary))" }}>Active</span>
                    <button
                      onClick={clearBroadcast}
                      className="flex items-center gap-1 text-[10px] transition-opacity opacity-60 hover:opacity-100"
                      style={{ color: "hsl(0 70% 60%)" }}
                      data-testid="button-clear-broadcast"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{activeBroadcast.message}</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {new Date(activeBroadcast.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  New message
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type your announcement…"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
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
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {sending ? "Sending…" : "Broadcast to all users"}
                </Button>
              </div>
            </div>
          )}

          {/* Tab: Users */}
          {tab === "users" && (
            <div className="max-h-72 overflow-y-auto">
              {loadingStats ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
                  ))}
                </div>
              ) : stats ? (
                <div className="p-2 space-y-1">
                  <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {stats.userCount} registered {stats.userCount === 1 ? "user" : "users"}
                  </p>
                  {stats.users.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                      data-testid={`dev-user-${u.id}`}
                    >
                      <Avatar className="w-7 h-7 flex-shrink-0">
                        <AvatarImage src={u.avatar ?? undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-semibold">
                          {initials(u)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{u.displayName ?? u.username}</p>
                        <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{u.username}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {u.hasSpotify && (
                          <Music className="w-3 h-3" style={{ color: "#1DB954" }} title="Spotify connected" />
                        )}
                        <div className="flex items-center gap-0.5" title={`${u.conversationCount} conversations`}>
                          <MessageSquare className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
                          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{u.conversationCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Failed to load stats</p>
              )}
            </div>
          )}

          {/* Tab: Spotify */}
          {tab === "spotify" && (
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                Spotify credentials
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                Configure your Spotify app credentials. These are only visible to you.
              </p>
              <SpotifySettings inDevPanel />
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes dev-panel-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </>
  );
}
