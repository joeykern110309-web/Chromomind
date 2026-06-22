import { Zap, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function renderContent(text: string) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, si) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const body = seg.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
      return (
        <pre
          key={si}
          className="my-3 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 16px",
            color: "hsl(var(--primary))",
          }}
        >
          <code>{body.trim()}</code>
        </pre>
      );
    }
    const inlineParts = seg.split(/(`[^`]+`)/g);
    return (
      <span key={si}>
        {inlineParts.map((part, pi) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={pi}
                className="rounded-md px-1.5 py-0.5 text-xs font-mono"
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "hsl(var(--primary))",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
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
      className={cn(
        "flex gap-3 mb-6 items-end",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
      data-testid={`message-${role}`}
    >
      {/* Avatar */}
      {isUser ? (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(199 85% 42%))",
            boxShadow: "0 0 14px hsl(var(--primary)/0.45), 0 2px 6px rgba(0,0,0,0.3)",
          }}
          data-testid="avatar-user"
        >
          <User className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
      ) : (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(var(--primary)/0.06))",
            border: "1px solid hsl(var(--primary)/0.3)",
            boxShadow: "0 0 14px hsl(var(--primary)/0.18), 0 2px 6px rgba(0,0,0,0.2)",
          }}
          data-testid="avatar-assistant"
        >
          <Zap className="w-4 h-4 text-primary" strokeWidth={2} />
        </div>
      )}

      {/* Bubble */}
      <div className={cn("flex flex-col gap-1.5 max-w-[78%]", isUser ? "items-end" : "items-start")}>
        {isUser ? (
          /* ── User bubble: glossy gradient ── */
          <div
            className="relative rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed overflow-hidden text-white"
            style={{
              background: "linear-gradient(145deg, hsl(var(--primary)), hsl(199 80% 40%))",
              boxShadow: "0 4px 20px hsl(var(--primary)/0.3), 0 1px 4px rgba(0,0,0,0.2)",
            }}
            data-testid="message-content-user"
          >
            {/* Inner gloss shine */}
            <div
              className="absolute inset-x-0 top-0 h-1/2 pointer-events-none rounded-t-2xl"
              style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)" }}
            />
            <div className="relative whitespace-pre-wrap break-words">
              {renderContent(content)}
            </div>
          </div>
        ) : (
          /* ── AI bubble: glassmorphism ── */
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.065), rgba(255,255,255,0.03))",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              color: "hsl(var(--foreground))",
            }}
            data-testid="message-content-assistant"
          >
            <div className="whitespace-pre-wrap break-words">{renderContent(content)}</div>
          </div>
        )}

        <span
          className="text-[11px] px-1 select-none"
          style={{ color: "rgba(255,255,255,0.28)" }}
          data-testid={`message-timestamp-${role}`}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
