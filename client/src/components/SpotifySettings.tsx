import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SpotifyConfigResponse {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  hasSecret: boolean;
}

export default function SpotifySettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  const { data: cfg } = useQuery<SpotifyConfigResponse>({
    queryKey: ["/api/spotify/config"],
    enabled: open,
  });

  useEffect(() => {
    if (cfg) {
      setClientId(cfg.clientId || "");
      setClientSecret("");
      setRedirectUri(cfg.redirectUri || "");
    }
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/spotify/config", {
        clientId: clientId.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        redirectUri: redirectUri.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      toast({ title: "Settings saved", description: "Spotify credentials updated." });
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="opacity-60" title="Spotify settings" data-testid="button-spotify-settings">
          <Settings className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Spotify Credentials
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Get these from your{" "}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-[#1DB954] underline underline-offset-2 inline-flex items-center gap-1"
            >
              Spotify Developer Dashboard
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Your Spotify Client ID"
              data-testid="input-spotify-client-id"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">
              Client Secret
              {cfg?.hasSecret && !clientSecret && (
                <span className="ml-2 text-xs text-muted-foreground">(saved — leave blank to keep)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="clientSecret"
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={cfg?.hasSecret ? "Leave blank to keep current" : "Your Spotify Client Secret"}
                className="pr-10"
                data-testid="input-spotify-client-secret"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-60"
                onClick={() => setShowSecret((v) => !v)}
                data-testid="button-toggle-secret-visibility"
              >
                {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="redirectUri">Redirect URI</Label>
            <Input
              id="redirectUri"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://your-app.replit.dev/api/spotify/callback"
              data-testid="input-spotify-redirect-uri"
            />
            <p className="text-xs text-muted-foreground">
              Must match exactly what's set in your Spotify app settings.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !clientId.trim() || !redirectUri.trim()}
            data-testid="button-save-spotify-settings"
          >
            {saveMutation.isPending ? "Saving..." : "Save & Reconnect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
