import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SkipBack, SkipForward, Play, Pause, Music, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

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
      }, 500);
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
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 flex items-center justify-center flex-shrink-0">
            <Music className="w-4 h-4 text-[#1DB954]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sidebar-foreground">Spotify</p>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </div>
        </div>
        <a href="/api/spotify/login" data-testid="button-spotify-connect">
          <Button size="sm" className="w-full gap-2 bg-[#1DB954] hover:bg-[#1DB954] text-black font-semibold">
            <LogIn className="w-3 h-3" />
            Connect Spotify
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="border-t border-sidebar-border p-3 space-y-2">
      {/* Track info */}
      <div className="flex items-center gap-2 min-w-0">
        {np?.albumArt ? (
          <img
            src={np.albumArt}
            alt={np.albumName}
            className="w-10 h-10 rounded-md flex-shrink-0 object-cover"
            data-testid="img-album-art"
          />
        ) : (
          <div className="w-10 h-10 rounded-md bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-muted-foreground" />
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
              <p className="text-xs font-semibold text-sidebar-foreground">Spotify Connected</p>
              <p className="text-xs text-muted-foreground">Nothing playing</p>
            </>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="flex-shrink-0 opacity-60"
          onClick={() => disconnectMutation.mutate()}
          data-testid="button-spotify-disconnect"
          title="Disconnect Spotify"
        >
          <LogOut className="w-3 h-3" />
        </Button>
      </div>

      {/* Progress bar */}
      {np && (
        <div className="space-y-1">
          <div className="h-1 bg-sidebar-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1DB954] rounded-full transition-all duration-1000"
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
      <div className="flex items-center justify-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate("previous")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-previous"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate(np?.isPlaying ? "pause" : "play")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-playpause"
          className={cn("w-9 h-9", np?.isPlaying && "text-[#1DB954]")}
        >
          {np?.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => playerMutation.mutate("next")}
          disabled={playerMutation.isPending}
          data-testid="button-spotify-next"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
