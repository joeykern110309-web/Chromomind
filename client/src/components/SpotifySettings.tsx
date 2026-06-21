import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Eye, EyeOff, ExternalLink, Copy, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const detectedRedirectUri = `${window.location.origin}/api/spotify/callback`;

  const { data: cfg } = useQuery<SpotifyConfigResponse>({
    queryKey: ["/api/spotify/config"],
    enabled: open,
  });

  useEffect(() => {
    if (cfg) {
      setClientId(cfg.clientId || "");
      setClientSecret("");
    }
  }, [cfg]);

  const handleCopy = () => {
    navigator.clipboard.writeText(detectedRedirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/spotify/config", {
        clientId: clientId.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        redirectUri: detectedRedirectUri,
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
          <DialogTitle>Spotify Credentials</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1 — Redirect URI callout */}
          <div className="rounded-md bg-muted p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Step 1 — Add this to your Spotify app</p>
            <p className="text-xs text-muted-foreground">
              In your{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[#1DB954] underline underline-offset-2 inline-flex items-center gap-1"
              >
                Spotify Dashboard
                <ExternalLink className="w-3 h-3" />
              </a>
              , go to your app → Edit Settings → Redirect URIs and add this exactly:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-background rounded-md px-2 py-1.5 text-foreground break-all select-all" data-testid="text-redirect-uri">
                {detectedRedirectUri}
              </code>
              <Button size="icon" variant="ghost" onClick={handleCopy} data-testid="button-copy-redirect-uri" className="flex-shrink-0">
                {copied ? <Check className="w-3 h-3 text-[#1DB954]" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Step 2 — Credentials */}
          <p className="text-xs font-semibold text-foreground">Step 2 — Paste your credentials</p>

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="From your Spotify Dashboard"
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
                placeholder={cfg?.hasSecret ? "Leave blank to keep current" : "From your Spotify Dashboard"}
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

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !clientId.trim() || (!cfg?.hasSecret && !clientSecret.trim())}
            data-testid="button-save-spotify-settings"
          >
            {saveMutation.isPending ? "Saving..." : "Save & Reconnect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
