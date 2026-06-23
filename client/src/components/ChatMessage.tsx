import { Zap, User, Play, Music, ListMusic, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Spotify card types ────────────────────────────────────────────────────────

interface SpotifyTrack {
  uri: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  trackCount: number;
  imageUrl: string | null;
}

interface SpotifyCardData {
  type: "playlists" | "queue" | "artist_tracks";
  // playlists
  items?: SpotifyPlaylist[];
  // queue
  current?: { name: string; artistName: string; imageUrl: string | null } | null;
  upcoming?: Array<{ name: string; artistName: string; imageUrl: string | null }>;
  // artist_tracks
  artistName?: string;
  playing?: boolean;
  tracks?: SpotifyTrack[];
}

/** Parse SPOTIFY_CARD from first line of content. Returns [cardData, remainingText] */
function parseSpotifyCard(content: string): [SpotifyCardData | null, string] {
  const firstNewline = content.indexOf("\n");
  const firstLine = firstNewline === -1 ? content : content.slice(0, firstNewline);
  const rest = firstNewline === -1 ? "" : content.slice(firstNewline + 1);
  if (firstLine.startsWith("SPOTIFY_CARD:")) {
    try {
      const json = firstLine.slice("SPOTIFY_CARD:".length);
      const data = JSON.parse(json) as SpotifyCardData;
      return [data, rest];
    } catch { /* fall through */ }
  }
  return [null, content];
}

// ── Shared styles ────────────────────────────────────────────────────────────

const GLASS_CARD = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "12px",
  backdropFilter: "blur(8px)",
} as React.CSSProperties;

const TRACK_ROW = "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors";

function AlbumArt({
  url,
  size = 40,
  className,
}: {
  url: string | null;
  size?: number;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={cn("rounded-md object-cover flex-shrink-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn("rounded-md flex items-center justify-center flex-shrink-0", className)}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, hsl(var(--primary)/0.3), hsl(var(--primary)/0.1))",
      }}
    >
      <Music className="text-primary" style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}

// ── Playlist grid card ────────────────────────────────────────────────────────

function PlaylistsCard({ items }: { items: SpotifyPlaylist[] }) {
  const { toast } = useToast();
  const [loadingUri, setLoadingUri] = useState<string | null>(null);

  async function playPlaylist(uri: string, name: string) {
    setLoadingUri(uri);
    try {
      const res = await apiRequest("POST", "/api/spotify/play-context", { uri });
      const data = await res.json();
      if (!data.success) {
        toast({ title: "Couldn't start playlist", description: "Make sure Spotify is open on a device.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to play playlist.", variant: "destructive" });
    } finally {
      setLoadingUri(null);
    }
  }

  return (
    <div className="mt-3 mb-1 space-y-2" data-testid="card-playlists">
      <div className="text-xs font-medium mb-2" style={{ color: "hsl(var(--primary))" }}>
        <ListMusic className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
        Your Playlists
      </div>
      <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
        {items.map((pl) => (
          <div
            key={pl.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={GLASS_CARD}
            data-testid={`card-playlist-${pl.id}`}
          >
            <AlbumArt url={pl.imageUrl} size={44} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
                {pl.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.42)" }}>
                {pl.trackCount} {pl.trackCount === 1 ? "song" : "songs"}
              </div>
            </div>
            <button
              onClick={() => playPlaylist(pl.uri, pl.name)}
              disabled={loadingUri === pl.uri}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: loadingUri === pl.uri
                  ? "rgba(255,255,255,0.08)"
                  : "linear-gradient(135deg, hsl(var(--primary)), hsl(199 80% 40%))",
                boxShadow: loadingUri === pl.uri ? "none" : "0 0 12px hsl(var(--primary)/0.4)",
              }}
              data-testid={`button-play-playlist-${pl.id}`}
            >
              <Play className="w-3.5 h-3.5 text-white fill-white" style={{ marginLeft: "1px" }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Queue card ────────────────────────────────────────────────────────────────

function QueueCard({
  current,
  upcoming,
}: {
  current: { name: string; artistName: string; imageUrl: string | null } | null | undefined;
  upcoming: Array<{ name: string; artistName: string; imageUrl: string | null }>;
}) {
  return (
    <div className="mt-3 mb-1 space-y-2" data-testid="card-queue">
      {current && (
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={GLASS_CARD}>
          <AlbumArt url={current.imageUrl} size={52} />
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: "hsl(var(--primary))" }}
            >
              Now Playing
            </div>
            <div className="text-sm font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
              {current.name}
            </div>
            <div className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              {current.artistName}
            </div>
          </div>
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: "hsl(var(--primary))",
              boxShadow: "0 0 8px hsl(var(--primary)/0.8)",
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <div
            className="text-xs font-medium px-1 mb-2"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <Clock className="inline w-3 h-3 mr-1 -mt-0.5" />
            Up Next
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {upcoming.map((t, i) => (
              <div
                key={i}
                className={TRACK_ROW}
                style={{ background: "rgba(255,255,255,0.03)", color: "hsl(var(--foreground))" }}
                data-testid={`queue-track-${i}`}
              >
                <span
                  className="text-xs w-5 text-right flex-shrink-0 select-none"
                  style={{ color: "rgba(255,255,255,0.28)" }}
                >
                  {i + 1}
                </span>
                <AlbumArt url={t.imageUrl} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.name}</div>
                  <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.42)" }}>
                    {t.artistName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Artist tracks card ────────────────────────────────────────────────────────

function ArtistTracksCard({
  artistName,
  tracks,
  playing,
}: {
  artistName: string;
  tracks: SpotifyTrack[];
  playing?: boolean;
}) {
  return (
    <div className="mt-3 mb-1" data-testid="card-artist-tracks">
      <div className="text-xs font-medium mb-2" style={{ color: "hsl(var(--primary))" }}>
        <Music className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
        {playing ? "Now Playing" : "Tracks"} · {artistName}
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {tracks.map((t, i) => (
          <div
            key={t.uri}
            className={cn(TRACK_ROW, "rounded-xl")}
            style={
              i === 0 && playing
                ? {
                    background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(var(--primary)/0.06))",
                    border: "1px solid hsl(var(--primary)/0.25)",
                  }
                : { background: "rgba(255,255,255,0.03)" }
            }
            data-testid={`artist-track-${i}`}
          >
            {i === 0 && playing ? (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "hsl(var(--primary))", boxShadow: "0 0 8px hsl(var(--primary)/0.5)" }}
              >
                <Play className="w-2.5 h-2.5 text-white fill-white" style={{ marginLeft: "1px" }} />
              </div>
            ) : (
              <span
                className="text-xs w-5 text-right flex-shrink-0 select-none"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                {i + 1}
              </span>
            )}
            <AlbumArt url={t.imageUrl} size={32} />
            <div className="flex-1 min-w-0">
              <div
                className="text-sm truncate"
                style={{ color: i === 0 && playing ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
              >
                {t.name}
              </div>
              <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.42)" }}>
                {t.artistName}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main SpotifyCard dispatcher ──────────────────────────────────────────────

function SpotifyCard({ data }: { data: SpotifyCardData }) {
  if (data.type === "playlists" && data.items?.length) {
    return <PlaylistsCard items={data.items} />;
  }
  if (data.type === "queue") {
    return <QueueCard current={data.current} upcoming={data.upcoming ?? []} />;
  }
  if (data.type === "artist_tracks" && data.tracks?.length) {
    return (
      <ArtistTracksCard
        artistName={data.artistName ?? ""}
        tracks={data.tracks}
        playing={data.playing}
      />
    );
  }
  return null;
}

// ── Markdown-ish text renderer ────────────────────────────────────────────────

function renderContent(text: string) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, si) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const body = seg.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
      return (
        <pre
          key={si}
          className="my-3 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 16px",
            color: "hsl(var(--primary))",
          }}
        >
          <code>{body.trim()}</code>
        </pre>
      );
    }
    const inlineParts = seg.split(/(`[^`]+`)/g);
    return (
      <span key={si}>
        {inlineParts.map((part, pi) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={pi}
                className="rounded-md px-1.5 py-0.5 text-xs font-mono"
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "hsl(var(--primary))",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          const lines = part.split("\n");
          return lines.map((line, li) => {
            const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
              <span key={`${pi}-${li}`}>
                {boldParts.map((bp, bi) =>
                  bp.startsWith("**") && bp.endsWith("**") ? (
                    <strong key={bi} className="font-semibold">
                      {bp.slice(2, -2)}
                    </strong>
                  ) : (
                    bp
                  )
                )}
                {li < lines.length - 1 && <br />}
              </span>
            );
          });
        })}
      </span>
    );
  });
}

// ── Main ChatMessage component ────────────────────────────────────────────────

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === "user";
  const [cardData, textContent] = isUser ? [null, content] : parseSpotifyCard(content);

  return (
    <div
      className={cn("flex gap-3 mb-6 items-end", isUser ? "flex-row-reverse" : "flex-row")}
      data-testid={`message-${role}`}
    >
      {/* Avatar */}
      {isUser ? (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(199 85% 42%))",
            boxShadow: "0 0 14px hsl(var(--primary)/0.45), 0 2px 6px rgba(0,0,0,0.3)",
          }}
          data-testid="avatar-user"
        >
          <User className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
      ) : (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(var(--primary)/0.06))",
            border: "1px solid hsl(var(--primary)/0.3)",
            boxShadow: "0 0 14px hsl(var(--primary)/0.18), 0 2px 6px rgba(0,0,0,0.2)",
          }}
          data-testid="avatar-assistant"
        >
          <Zap className="w-4 h-4 text-primary" strokeWidth={2} />
        </div>
      )}

      {/* Bubble */}
      <div className={cn("flex flex-col gap-1.5 max-w-[78%]", isUser ? "items-end" : "items-start")}>
        {isUser ? (
          <div
            className="relative rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed overflow-hidden text-white"
            style={{
              background: "linear-gradient(145deg, hsl(var(--primary)), hsl(199 80% 40%))",
              boxShadow: "0 4px 20px hsl(var(--primary)/0.3), 0 1px 4px rgba(0,0,0,0.2)",
            }}
            data-testid="message-content-user"
          >
            <div
              className="absolute inset-x-0 top-0 h-1/2 pointer-events-none rounded-t-2xl"
              style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)" }}
            />
            <div className="relative whitespace-pre-wrap break-words">{renderContent(content)}</div>
          </div>
        ) : (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.065), rgba(255,255,255,0.03))",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              color: "hsl(var(--foreground))",
            }}
            data-testid="message-content-assistant"
          >
            {textContent && (
              <div className="whitespace-pre-wrap break-words">{renderContent(textContent)}</div>
            )}
            {cardData && <SpotifyCard data={cardData} />}
          </div>
        )}

        <span
          className="text-[11px] px-1 select-none"
          style={{ color: "rgba(255,255,255,0.28)" }}
          data-testid={`message-timestamp-${role}`}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
