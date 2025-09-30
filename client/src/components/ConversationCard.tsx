import { MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ConversationCardProps {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  isActive?: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export default function ConversationCard({
  id,
  title,
  preview,
  timestamp,
  isActive = false,
  onClick,
  onDelete,
}: ConversationCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-md p-3 cursor-pointer transition-all duration-150 hover-elevate active-elevate-2",
        isActive
          ? "bg-sidebar-accent border-l-4 border-primary"
          : "bg-transparent hover:bg-sidebar-accent/50"
      )}
      onClick={onClick}
      data-testid={`conversation-card-${id}`}
    >
      <div className="flex items-start gap-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className={cn(
                "text-sm font-medium truncate",
                isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
              )}
              data-testid={`conversation-title-${id}`}
            >
              {title}
            </h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {timestamp}
            </span>
          </div>
          <p
            className="text-xs text-muted-foreground truncate"
            data-testid={`conversation-preview-${id}`}
          >
            {preview}
          </p>
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        data-testid={`button-delete-${id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
