// Campana de notificaciones en la title bar (actividad local).

import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useActivity } from "@/lib/activity-context";
import type { ViewId } from "@/components/Toolbar";

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface NotificationBellProps {
  onNavigate: (view: ViewId, payload?: Record<string, string>) => void;
  onOpenFiles?: (path?: string) => void;
}

export function NotificationBell({
  onNavigate,
  onOpenFiles,
}: NotificationBellProps) {
  const { events, unreadCount, markRead, markAllRead } = useActivity();
  const recent = events.slice(0, 12);
  const hasUnread = unreadCount > 0;

  const handleOpen = (ev: (typeof events)[0]) => {
    void markRead(ev.id);
    if (ev.filePath && onOpenFiles) {
      onOpenFiles(ev.filePath);
      return;
    }
    const view = ev.viewId ?? ev.toolId;
    if (view) onNavigate(view as ViewId, ev.payload);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            hasUnread
              ? `Notificaciones (${unreadCount} sin leer)`
              : "Notificaciones"
          }
          className={cn(
            "relative inline-flex h-full w-11 shrink-0 items-center justify-center transition-colors",
            "text-amber-600 hover:bg-amber-500/15 hover:text-amber-500",
            "dark:text-amber-400 dark:hover:text-amber-300",
            hasUnread && "bg-amber-500/10"
          )}
        >
          <Bell
            className={cn(
              "size-4",
              hasUnread && "fill-amber-500/20"
            )}
            strokeWidth={2}
          />
          {hasUnread && (
            <span
              className={cn(
                "pointer-events-none absolute top-1 right-1",
                "flex h-4 min-w-4 items-center justify-center rounded-full",
                "bg-amber-500 px-1 text-[10px] font-bold leading-none text-amber-950",
                "ring-1 ring-sidebar"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notificaciones</span>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                void markAllRead();
              }}
            >
              <CheckCheck className="size-3" />
              Leídas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Todavía no hay actividad registrada.
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            {recent.map((ev) => (
              <DropdownMenuItem
                key={ev.id}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-0.5 py-2",
                  !ev.read && "bg-amber-500/8"
                )}
                onClick={() => handleOpen(ev)}
              >
                <span
                  className={cn(
                    "text-sm leading-tight",
                    !ev.read && "font-medium"
                  )}
                >
                  {ev.title}
                </span>
                {ev.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {ev.body}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatRelative(ev.at)}
                </span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
