import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function renderContent(text: string) {
  // Split into code-block segments vs normal text
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, si) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const body = seg.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
      return (
        <pre
          key={si}
          className="my-2 rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-xs font-mono overflow-x-auto text-cyan-300 leading-relaxed"
        >
          <code>{body.trim()}</code>
        </pre>
      );
    }
    // Inline segments: split on `code`
    const inlineParts = seg.split(/(`[^`]+`)/g);
    return (
      <span key={si}>
        {inlineParts.map((part, pi) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={pi}
                className="rounded px-1.5 py-0.5 bg-black/30 border border-white/10 text-xs font-mono text-cyan-300"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          // Handle **bold** and line breaks
          const lines = part.split("\n");
          return lines.map((line, li) => {
            const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
              <span key={`${pi}-${li}`}>
                {boldParts.map((bp, bi) =>
                  bp.startsWith("**") && bp.endsWith("**") ? (
                    <strong key={bi} className="font-semibold">{bp.slice(2, -2)}</strong>
                  ) : bp
                )}
                {li < lines.length - 1 && <br />}
              </span>
            );
          });
        })}
      </span>
    );
  });
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex gap-3 mb-5 items-end", isUser ? "flex-row-reverse" : "flex-row")}
      data-testid={`message-${role}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-1 ring-1",
          isUser
            ? "bg-primary ring-primary/30 glow-sm"
            : "bg-card ring-border"
        )}
        data-testid={`avatar-${role}`}
      >
        {isUser
          ? <User className="w-4 h-4 text-primary-foreground" />
          : <Bot className="w-4 h-4 text-primary" />
        }
      </div>

      {/* Bubble */}
      <div className={cn("flex flex-col gap-1 max-w-[78%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? [
                  "rounded-br-sm text-primary-foreground",
                  "bg-gradient-to-br from-primary to-[hsl(199_80%_45%)]",
                  "shadow-lg shadow-primary/20 glow-sm",
                ].join(" ")
              : [
                  "rounded-bl-sm text-foreground",
                  "bg-card/80 border border-border/70 backdrop-blur-sm",
                  "shadow-md",
                ].join(" ")
          )}
          data-testid={`message-content-${role}`}
        >
          <div className="whitespace-pre-wrap break-words">{renderContent(content)}</div>
        </div>
        <span className="text-[11px] text-muted-foreground px-1" data-testid={`message-timestamp-${role}`}>
          {timestamp}
        </span>
      </div>
    </div>
  );
}
