import { MessageSquare, Trash2, Pencil } from "lucide-react";
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
  onRename?: (e: React.MouseEvent) => void;
}

export default function ConversationCard({
  id,
  title,
  preview,
  timestamp,
  isActive = false,
  onClick,
  onDelete,
  onRename,
}: ConversationCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-md p-3 cursor-pointer transition-all duration-150 hover-elevate active-elevate-2",
        isActive
          ? "bg-sidebar-accent border-l-4 border-primary pl-2"
          : "bg-transparent"
      )}
      onClick={onClick}
      data-testid={`conversation-card-${id}`}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 pr-12">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <h3
              className={cn(
                "text-sm font-medium truncate",
                isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
              )}
              data-testid={`conversation-title-${id}`}
            >
              {title}
            </h3>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p
              className="text-xs text-muted-foreground truncate flex-1"
              data-testid={`conversation-preview-${id}`}
            >
              {preview}
            </p>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              {timestamp}
            </span>
          </div>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onRename && (
          <Button
            size="icon"
            variant="ghost"
            className="w-6 h-6"
            onClick={(e) => {
              e.stopPropagation();
              onRename(e);
            }}
            data-testid={`button-rename-${id}`}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="w-6 h-6"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          data-testid={`button-delete-${id}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
