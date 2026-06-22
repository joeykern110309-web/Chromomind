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
  id, title, preview, timestamp,
  isActive = false, onClick, onDelete, onRename,
}: ConversationCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-lg p-3 cursor-pointer transition-all duration-150 hover-elevate active-elevate-2",
        isActive
          ? "bg-sidebar-accent"
          : "bg-transparent hover:bg-sidebar-accent/60"
      )}
      onClick={onClick}
      data-testid={`conversation-card-${id}`}
    >
      {/* Active left accent bar */}
      {isActive && (
        <div className="absolute left-0 inset-y-2 w-0.5 rounded-r-full bg-primary glow-sm" />
      )}

      <div className="flex items-start gap-2 pl-2">
        <MessageSquare
          className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground")}
        />
        <div className="flex-1 min-w-0 pr-10">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <h3
              className={cn("text-xs font-semibold truncate transition-colors", isActive ? "text-foreground" : "text-sidebar-foreground")}
              data-testid={`conversation-title-${id}`}
            >
              {title}
            </h3>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground truncate flex-1" data-testid={`conversation-preview-${id}`}>
              {preview}
            </p>
            <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap flex-shrink-0">{timestamp}</span>
          </div>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onRename && (
          <Button size="icon" variant="ghost" className="w-6 h-6" onClick={(e) => { e.stopPropagation(); onRename(e); }} data-testid={`button-rename-${id}`}>
            <Pencil className="w-3 h-3" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="w-6 h-6" onClick={(e) => { e.stopPropagation(); onDelete(); }} data-testid={`button-delete-${id}`}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
