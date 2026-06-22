import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: unknown) => void) => void;
  removeListener: (event: string, cb?: (data: unknown) => void) => void;
}

export function useSpotifySDK(connected: boolean) {
  const playerRef = useRef<SpotifyPlayer | null>(null);

  useEffect(() => {
    if (!connected) return;

    const initPlayer = () => {
      if (!window.Spotify) return;

      const player = new window.Spotify.Player({
        name: "AI Chatbot Player",
        getOAuthToken: async (cb) => {
          try {
            const res = await fetch("/api/spotify/sdk-token");
            if (!res.ok) return;
            const { accessToken } = await res.json();
            cb(accessToken);
          } catch {
            // token unavailable
          }
        },
        volume: 0.8,
      });

      playerRef.current = player;

      player.addListener("ready", async (data: unknown) => {
        const { device_id } = data as { device_id: string };
        console.log("[SpotifySDK] Player ready, device_id:", device_id);
        try {
          await fetch("/api/spotify/device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: device_id }),
          });
        } catch { /* ignore */ }
      });

      player.addListener("not_ready", (data: unknown) => {
        const { device_id } = data as { device_id: string };
        console.warn("[SpotifySDK] Player not ready, device_id:", device_id);
      });

      player.addListener("initialization_error", (data: unknown) => {
        console.error("[SpotifySDK] Init error:", data);
      });

      player.addListener("authentication_error", (data: unknown) => {
        console.error("[SpotifySDK] Auth error:", data);
      });

      player.addListener("account_error", (data: unknown) => {
        console.error("[SpotifySDK] Account error (Premium required?):", data);
      });

      player.connect();
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      // Dynamically inject the SDK script if not already present
      if (!document.querySelector('script[src*="spotify-player"]')) {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [connected]);
}
