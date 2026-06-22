import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [message]);

  const canSend = message.trim() && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(message.trim());
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="relative px-4 pb-6 pt-3 bg-background" data-testid="chat-input-container">
      {/* Gradient fade blending into the chat area */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 h-10"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
      />

      <div className="relative max-w-3xl mx-auto">
        {/* Outer glow ring when focused */}
        <div
          className="absolute -inset-[1px] rounded-2xl transition-opacity duration-300 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, hsl(var(--primary)/0.6), hsl(199 80% 50%/0.4))`,
            opacity: focused ? (canSend ? 0.9 : 0.5) : 0,
            borderRadius: "17px",
          }}
        />

        {/* Input container */}
        <div
          className="relative flex items-end gap-3 rounded-2xl px-4 py-3"
          style={{
            background: focused
              ? "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
              : "linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
            border: `1px solid ${focused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}`,
            backdropFilter: "blur(16px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)",
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("messagePlaceholder")}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed min-h-[22px] max-h-40 py-0.5"
            style={{ height: "22px" }}
            data-testid="input-message"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
            style={canSend ? {
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(199 80% 42%))",
              boxShadow: "0 0 14px hsl(var(--primary)/0.5), 0 2px 6px rgba(0,0,0,0.2)",
              transform: "scale(1)",
            } : {
              background: "rgba(255,255,255,0.06)",
              opacity: 0.4,
            }}
            onMouseEnter={e => canSend && ((e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)")}
            onMouseLeave={e => canSend && ((e.currentTarget as HTMLButtonElement).style.transform = "scale(1)")}
            data-testid="button-send"
          >
            <ArrowUp className="w-4 h-4 text-white" strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-[11px] mt-2 text-center select-none" style={{ color: "rgba(255,255,255,0.2)" }}>
          {t("enterToSend")}
        </p>
      </div>
    </div>
  );
}
