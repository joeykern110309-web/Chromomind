import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SkipBack, SkipForward, Play, Pause, Music2, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useSpotifySDK } from "@/hooks/use-spotify-sdk";

interface NowPlaying {
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string | null;
  duration: number;
  progress: number;
  trackUrl: string | null;
}

interface SpotifyStatus {
  connected: boolean;
  nowPlaying: NowPlaying | null;
}

export default function SpotifyPlayer() {
  const queryClient = useQueryClient();

  const { data: status } = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 5000,
  });

  useSpotifySDK(status?.connected === true);

  const { data: nowPlayingData } = useQuery<{ nowPlaying: NowPlaying | null }>({
    queryKey: ["/api/spotify/now-playing"],
    refetchInterval: 3000,
    enabled: status?.connected === true,
  });

  const playerMutation = useMutation({
    mutationFn: (action: string) => apiRequest("POST", `/api/spotify/player/${action}`),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/spotify/now-playing"] });
        queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      }, 1000);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spotify/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/now-playing"] });
    },
  });

  const np = nowPlayingData?.nowPlaying ?? status?.nowPlaying ?? null;
  const progressPercent = np ? Math.round((np.progress / np.duration) * 100) : 0;

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  if (!status?.connected) {
    return (
      <div className="border-t border-sidebar-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1DB954]/10 border border-[#1DB954]/20 flex items-center justify-center flex-shrink-0">
            <Music2 className="w-4 h-4 text-[#1DB954]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground">Spotify</p>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </div>
        </div>
        <a href="/api/spotify/login" data-testid="button-spotify-connect">
          <Button
            size="sm"
            className="w-full gap-2 text-xs font-semibold"
            style={{ background: "#1DB954", color: "#000" }}
          >
            <LogIn className="w-3 h-3" />
            Connect Spotify
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="border-t border-sidebar-border p-3 space-y-3">
      {/* Track info row */}
      <div className="flex items-center gap-2 min-w-0">
        {np?.albumArt ? (
          <img
            src={np.albumArt}
            alt={np.albumName}
            className="w-10 h-10 rounded-md flex-shrink-0 object-cover"
            data-testid="img-album-art"
          />
        ) : (
          <div className="w-10 h-10 rounded-md bg-sidebar-accent border border-sidebar-border flex items-center justify-center flex-shrink-0">
            <Music2 className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {np ? (
            <>
              <p className="text-xs font-semibold text-sidebar-foreground truncate" data-testid="text-track-name">
                {np.trackName}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-artist-name">
                {np.artistName}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-sidebar-foreground">Connected</p>
              <p className="text-xs text-muted-foreground">Nothing playing</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="opacity-50"
            onClick={() => disconnectMutation.mutate()}
            data-testid="button-spotify-disconnect"
            title="Disconnect"
          >
            <LogOut className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {np && (
        <div className="space-y-1">
          <div className="h-1 bg-sidebar-accent rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 bg-primary glow-sm"
              style={{ width: `${progressPercent}%` }}
              data-testid="progress-track"
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatTime(np.progress)}</span>
            <span>{formatTime(np.duration)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate("previous")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-previous"
          className="opacity-70"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate(np?.isPlaying ? "pause" : "play")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-playpause"
          className={cn(
            "w-9 h-9 rounded-full border",
            np?.isPlaying
              ? "border-primary/40 text-primary glow-sm"
              : "border-border text-foreground"
          )}
        >
          {np?.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate("next")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-next"
          className="opacity-70"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
