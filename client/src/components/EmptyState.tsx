import { Zap, Globe, Music2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onPromptClick: (prompt: string) => void;
}

const suggestedPrompts = [
  {
    icon: Code2,
    title: "Explain a concept",
    prompt: "Can you explain how async/await works in JavaScript?",
  },
  {
    icon: Globe,
    title: "General chat",
    prompt: "Tell me an interesting fact about the universe",
  },
  {
    icon: Music2,
    title: "Play music",
    prompt: "Play Blinding Lights by The Weeknd",
  },
  {
    icon: Zap,
    title: "Get advice",
    prompt: "What are some tips for staying productive during the day?",
  },
];

export default function EmptyState({ onPromptClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8" data-testid="empty-state">
      <div className="max-w-xl w-full space-y-10 text-center">
        <div className="space-y-4">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl glow-pulse" />
            <div className="relative w-20 h-20 rounded-full bg-card border border-primary/30 flex items-center justify-center glow-sm">
              <Zap className="w-9 h-9 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground text-glow">
              How can I help?
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Ask me anything, or pick one of these to get started
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestedPrompts.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 text-left bg-card border-border hover-elevate active-elevate-2"
                onClick={() => onPromptClick(item.prompt)}
                data-testid={`button-prompt-${index}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-semibold text-sm text-foreground">{item.title}</span>
                </div>
                <p className="text-xs text-muted-foreground text-left line-clamp-2 pl-9">
                  {item.prompt}
                </p>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
