import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SpotifyConfigResponse {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  hasSecret: boolean;
}

interface Props {
  inDevPanel?: boolean;
}

export default function SpotifySettings({ inDevPanel }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const detectedRedirectUri = `${window.location.origin}/api/spotify/callback`;

  const { data: cfg } = useQuery<SpotifyConfigResponse>({
    queryKey: ["/api/spotify/config"],
    enabled: inDevPanel,
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
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/spotify/config", {
        clientId: clientId.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        redirectUri: detectedRedirectUri,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      // Navigate to Spotify OAuth immediately after saving credentials
      window.location.href = "/api/spotify/login";
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const content = (
    <div className="space-y-4">
      {/* Redirect URI */}
      <div className="rounded-md p-3 space-y-2" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <p className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
          Add this redirect URI to your{" "}
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 inline-flex items-center gap-1"
            style={{ color: "#1DB954" }}
          >
            Spotify Dashboard
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[10px] rounded px-2 py-1.5 break-all select-all" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.8)" }} data-testid="text-redirect-uri">
            {detectedRedirectUri}
          </code>
          <Button size="icon" variant="ghost" onClick={handleCopy} data-testid="button-copy-redirect-uri" className="flex-shrink-0 opacity-70">
            {copied ? <Check className="w-3 h-3" style={{ color: "#1DB954" }} /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Client ID */}
      <div className="space-y-1.5">
        <Label htmlFor="sp-clientId" className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>Client ID</Label>
        <Input
          id="sp-clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="From your Spotify Dashboard"
          className="text-sm h-9"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}
          data-testid="input-spotify-client-id"
        />
      </div>

      {/* Client Secret */}
      <div className="space-y-1.5">
        <Label htmlFor="sp-clientSecret" className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          Client Secret
          {cfg?.hasSecret && !clientSecret && (
            <span className="ml-2 text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>(saved — leave blank to keep)</span>
          )}
        </Label>
        <div className="relative">
          <Input
            id="sp-clientSecret"
            type={showSecret ? "text" : "password"}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={cfg?.hasSecret ? "Leave blank to keep current" : "From your Spotify Dashboard"}
            className="text-sm h-9 pr-10"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}
            data-testid="input-spotify-client-secret"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-50"
            onClick={() => setShowSecret((v) => !v)}
            data-testid="button-toggle-secret-visibility"
          >
            {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      <Button
        className="w-full"
        size="sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !clientId.trim() || (!cfg?.hasSecret && !clientSecret.trim())}
        data-testid="button-save-spotify-settings"
      >
        {saveMutation.isPending ? "Saving…" : "Save & Connect Spotify"}
      </Button>
    </div>
  );

  return content;
}
