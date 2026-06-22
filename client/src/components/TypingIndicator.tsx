import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-6 items-end" data-testid="typing-indicator">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-1 bg-card border border-border">
        <Bot className="w-4 h-4 text-primary" />
      </div>

      <div className="flex flex-col gap-1 items-start">
        <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-card border border-border">
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
    </div>
  );
}
