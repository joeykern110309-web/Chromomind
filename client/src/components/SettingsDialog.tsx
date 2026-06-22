import { Settings, Moon, Sun, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage, LANGUAGES } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

export default function SettingsDialog() {
  const { lang, setLang, t } = useLanguage();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const init = saved || "dark";
    setTheme(init);
    document.documentElement.classList.toggle("dark", init === "dark");
  }, []);

  const toggleTheme = (next: "light" | "dark") => {
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-settings">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* Account */}
          {user && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("account")}</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={user.avatar ?? undefined} alt={user.displayName ?? user.username} />
                    <AvatarFallback className="text-xs bg-primary/20 text-primary font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.displayName ?? user.username}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.username}</p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleLogout}
                  data-testid="button-logout"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Language */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("language")}</p>
            <div className="grid grid-cols-1 gap-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover-elevate cursor-pointer",
                    lang === l.code
                      ? "bg-primary/10 border border-primary/25 text-foreground"
                      : "bg-transparent text-muted-foreground hover:text-foreground border border-transparent"
                  )}
                  data-testid={`button-lang-${l.code}`}
                >
                  <span>
                    <span className="font-medium text-foreground">{l.nativeLabel}</span>
                    {l.nativeLabel !== l.label && (
                      <span className="ml-2 text-muted-foreground text-xs">({l.label})</span>
                    )}
                  </span>
                  {lang === l.code && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("appearance")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => toggleTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors cursor-pointer",
                  theme === "dark"
                    ? "bg-primary/10 border-primary/25 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover-elevate"
                )}
                data-testid="button-theme-dark"
              >
                <Moon className="w-4 h-4" />
                {t("dark")}
                {theme === "dark" && <Check className="w-3 h-3 text-primary ml-auto" />}
              </button>
              <button
                onClick={() => toggleTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors cursor-pointer",
                  theme === "light"
                    ? "bg-primary/10 border-primary/25 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover-elevate"
                )}
                data-testid="button-theme-light"
              >
                <Sun className="w-4 h-4" />
                {t("light")}
                {theme === "light" && <Check className="w-3 h-3 text-primary ml-auto" />}
              </button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
