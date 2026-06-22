import { useState, useEffect } from "react";
import { Zap, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login() {
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => setGoogleEnabled(d.googleEnabled))
      .catch(() => setGoogleEnabled(false));

    if (window.location.search.includes("auth_error=1")) {
      setAuthError(true);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150" />
            <div className="relative w-16 h-16 rounded-2xl bg-card border border-primary/30 flex items-center justify-center glow">
              <Zap className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chromomind</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to access your conversations</p>
          </div>
        </div>

        {/* Auth error */}
        {authError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">Sign-in failed. Please try again.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {googleEnabled === null && (
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
        )}

        {/* Google sign-in */}
        {googleEnabled === true && (
          <a href="/api/auth/google" data-testid="link-google-signin">
            <Button className="w-full gap-3" data-testid="button-google-signin">
              <GoogleIcon />
              Continue with Google
            </Button>
          </a>
        )}

        {/* Setup instructions when not configured */}
        {googleEnabled === false && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm font-semibold text-foreground">Google sign-in not configured</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add these secrets in your Replit environment to enable login:
              </p>
              <div className="space-y-1.5">
                {["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].map((key) => (
                  <code key={key} className="block rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground font-mono">
                    {key}
                  </code>
                ))}
              </div>
              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Get credentials from{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    Google Cloud Console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {" "}→ OAuth 2.0 Client IDs. Set the redirect URI to:
                </p>
                <code className="mt-1.5 block rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground font-mono break-all">
                  {window.location.origin}/api/auth/google/callback
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
