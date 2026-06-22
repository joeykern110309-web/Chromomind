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
      className={cn("flex gap-3 mb-6 items-end", isUser ? "flex-row-reverse" : "flex-row")}
      data-testid={`message-${role}`}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-1",
          isUser
            ? "bg-primary glow-sm"
            : "bg-card border border-border"
        )}
        data-testid={`avatar-${role}`}
      >
        {isUser
          ? <User className="w-4 h-4 text-primary-foreground" />
          : <Bot className="w-4 h-4 text-primary" />
        }
      </div>

      <div className={cn("flex flex-col gap-1 max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground glow-sm rounded-br-sm"
              : "bg-card border border-border text-foreground rounded-bl-sm"
          )}
          data-testid={`message-content-${role}`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        </div>
        <span
          className="text-[11px] text-muted-foreground px-1"
          data-testid={`message-timestamp-${role}`}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
