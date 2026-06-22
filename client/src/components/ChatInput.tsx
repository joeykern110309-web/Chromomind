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
    <div className="px-4 pb-6 pt-2 bg-background" data-testid="chat-input-container">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            "relative rounded-2xl transition-all duration-300",
            focused && canSend ? "glow-pulse-border" : focused ? "glow-ring" : ""
          )}
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border bg-card/90 backdrop-blur-md px-4 py-3",
              focused ? "border-primary/40" : "border-border"
            )}
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
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[22px] max-h-40 py-0.5"
              style={{ height: "22px" }}
              data-testid="input-message"
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200",
                canSend
                  ? "bg-primary text-primary-foreground glow-sm cursor-pointer scale-100 hover:scale-105"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-40 scale-95"
              )}
              data-testid="button-send"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 text-center select-none">
          {t("enterToSend")}
        </p>
      </div>
    </div>
  );
}
