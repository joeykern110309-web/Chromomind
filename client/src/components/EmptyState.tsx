import { MessageSquareText, Sparkles, Lightbulb, Code } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onPromptClick: (prompt: string) => void;
}

const suggestedPrompts = [
  {
    icon: Code,
    title: "Explain a concept",
    prompt: "Can you explain how async/await works in JavaScript?",
  },
  {
    icon: Lightbulb,
    title: "Get advice",
    prompt: "What are some best practices for React component design?",
  },
  {
    icon: Sparkles,
    title: "Creative writing",
    prompt: "Help me write a creative story about time travel",
  },
  {
    icon: MessageSquareText,
    title: "General chat",
    prompt: "Tell me an interesting fact about space",
  },
];

export default function EmptyState({ onPromptClick }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8"
      data-testid="empty-state"
    >
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <MessageSquareText className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground">
            Start a conversation
          </h1>
          <p className="text-muted-foreground">
            Choose a prompt below or type your own message to begin chatting with your AI assistant
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestedPrompts.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 hover-elevate active-elevate-2"
                onClick={() => onPromptClick(item.prompt)}
                data-testid={`button-prompt-${index}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-sm">{item.title}</span>
                </div>
                <p className="text-xs text-muted-foreground text-left line-clamp-2">
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
