import { Zap, Globe, Music2, Code2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface EmptyStateProps {
  onPromptClick: (prompt: string) => void;
}

export default function EmptyState({ onPromptClick }: EmptyStateProps) {
  const { t } = useLanguage();

  const prompts = [
    { icon: Code2,  title: t("promptExplainTitle"), prompt: t("promptExplainDesc") },
    { icon: Globe,  title: t("promptChatTitle"),    prompt: t("promptChatDesc")    },
    { icon: Music2, title: t("promptMusicTitle"),   prompt: t("promptMusicDesc")   },
    { icon: Zap,    title: t("promptAdviceTitle"),  prompt: t("promptAdviceDesc")  },
  ];

  return (
    <div
      className="flex flex-col items-center justify-center min-h-full px-8 pt-20 pb-10 select-none"
      data-testid="empty-state"
    >
      <div className="max-w-lg w-full space-y-10 text-center">

        <div className="flex flex-col items-center gap-5">
          {/* Icon with decorative ring — extra padding so the ring doesn't clip */}
          <div className="relative p-4">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150 orb-float" />
            <div className="absolute inset-0 rounded-full border border-dashed border-primary/20 spin-slow" />
            <div className="relative w-20 h-20 rounded-full bg-card border border-primary/25 flex items-center justify-center glow">
              <Zap className="w-9 h-9 text-primary" strokeWidth={1.5} />
            </div>
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground text-glow">
              {t("howCanIHelp")}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {t("askMeAnything")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {prompts.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={() => onPromptClick(item.prompt)}
                className="group relative text-left rounded-xl border border-border bg-card/60 backdrop-blur-sm px-4 py-3.5 hover-elevate active-elevate-2 transition-all duration-200 hover:border-primary/30 cursor-pointer"
                data-testid={`button-prompt-${i}`}
              >
                <div className="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/[0.03] transition-colors duration-300" />
                <div className="relative flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-primary/15 transition-colors">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.prompt}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
