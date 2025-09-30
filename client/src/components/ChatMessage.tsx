import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-4 mb-6 items-start",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
      data-testid={`message-${role}`}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/80"
            : "bg-muted"
        )}
        data-testid={`avatar-${role}`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-primary-foreground" />
        ) : (
          <Bot className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-4 py-3 max-w-2xl",
            isUser
              ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
              : "bg-card border border-card-border"
          )}
          data-testid={`message-content-${role}`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>
        <span
          className="text-xs text-muted-foreground px-1"
          data-testid={`message-timestamp-${role}`}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
