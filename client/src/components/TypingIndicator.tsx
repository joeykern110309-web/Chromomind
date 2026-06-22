import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-5 items-end" data-testid="typing-indicator">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-1 ring-1 bg-card ring-border">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-card/80 border border-border/70 backdrop-blur-sm shadow-md">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary dot-bounce"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
