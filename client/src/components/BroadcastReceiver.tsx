import { useEffect, useRef, useState } from "react";
import { X, Megaphone } from "lucide-react";

interface Broadcast {
  id: string;
  message: string;
  timestamp: string;
}

const SEEN_KEY = "chromomind-seen-broadcasts";

function getSeenIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch { return new Set(); }
}

function markSeen(id: string) {
  const seen = getSeenIds();
  seen.add(id);
  const arr = Array.from(seen).slice(-50);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

export default function BroadcastReceiver() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => { setVisible(false); setLeaving(false); }, 350);
    if (broadcast) markSeen(broadcast.id);
  };

  const check = async () => {
    try {
      const res = await fetch("/api/admin/broadcast");
      if (!res.ok) return;
      const data = await res.json();
      const bc: Broadcast | null = data.broadcast;
      if (bc && !getSeenIds().has(bc.id)) {
        setBroadcast(bc);
        setVisible(true);
        setLeaving(false);
      }
    } catch { /* ignore network errors */ }
  };

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (!visible || !broadcast) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] flex justify-center px-4 pt-3 pointer-events-none"
      data-testid="broadcast-popup"
    >
      <div
        className="pointer-events-auto w-full max-w-xl rounded-2xl px-5 py-4 flex items-start gap-3 shadow-2xl"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(199 80% 45%/0.12))",
          border: "1px solid hsl(var(--primary)/0.4)",
          backdropFilter: "blur(20px)",
          animation: leaving
            ? "broadcast-out 0.35s cubic-bezier(0.4,0,1,1) forwards"
            : "broadcast-in 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
          style={{ background: "hsl(var(--primary)/0.2)", border: "1px solid hsl(var(--primary)/0.3)" }}
        >
          <Megaphone className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "hsl(var(--primary))" }}>
            Announcement
          </p>
          <p className="text-sm text-foreground leading-relaxed">{broadcast.message}</p>
        </div>

        <button
          onClick={dismiss}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
          data-testid="button-dismiss-broadcast"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <style>{`
        @keyframes broadcast-in {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes broadcast-out {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(-16px) scale(0.97); }
        }
      `}</style>
    </div>
  );
}
