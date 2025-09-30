import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-4 mb-6 items-start" data-testid="typing-indicator">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-muted">
        <Bot className="w-5 h-5 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1 items-start">
        <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
          <div className="flex gap-1.5">
            <div
              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
              style={{ animationDelay: "0ms", animationDuration: "1s" }}
            />
            <div
              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
              style={{ animationDelay: "150ms", animationDuration: "1s" }}
            />
            <div
              className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
              style={{ animationDelay: "300ms", animationDuration: "1s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
