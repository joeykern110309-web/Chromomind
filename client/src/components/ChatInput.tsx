import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Message...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 pb-5 pt-3 bg-background" data-testid="chat-input-container">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            "flex items-end gap-3 rounded-2xl border bg-card px-4 py-3 transition-all duration-200",
            focused ? "border-primary/50 glow-ring" : "border-border"
          )}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] max-h-40 py-0.5"
            style={{ height: "24px" }}
            rows={1}
            data-testid="input-message"
          />

          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className={cn(
              "rounded-xl flex-shrink-0 transition-all duration-200",
              message.trim() && !disabled ? "glow-sm" : "opacity-40"
            )}
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
