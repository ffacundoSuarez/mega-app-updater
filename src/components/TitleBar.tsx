// Title bar personalizada (sustituye a la decoración nativa de Windows).
// Lleva el logo + nombre de la app, notificaciones y controles de ventana.

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import type { ViewId } from "@/components/Toolbar";

const LOGO_URL = "/iconos_Iso-centro-rueda-1.svg";

const appWindow = getCurrentWindow();

export interface TitleBarProps {
  onNavigate: (view: ViewId) => void;
  onOpenFiles?: (path?: string) => void;
}

export function TitleBar({ onNavigate, onOpenFiles }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.isMaximized().then(setIsMaximized);
    appWindow
      .onResized(async () => {
        setIsMaximized(await appWindow.isMaximized());
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b bg-sidebar text-sidebar-foreground"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pl-3"
      >
        <img
          src={LOGO_URL}
          alt="Mega App"
          className="size-5"
          draggable={false}
        />
        <span className="text-xs font-medium tracking-tight">Mega App</span>
      </div>

      <div className="flex h-full items-stretch">
        <NotificationBell
          onNavigate={onNavigate}
          onOpenFiles={onOpenFiles}
        />
        <WindowButton
          onClick={() => appWindow.minimize()}
          aria-label="Minimizar"
        >
          <Minus className="size-3.5" strokeWidth={1.75} />
        </WindowButton>
        <WindowButton
          onClick={() => appWindow.toggleMaximize()}
          aria-label={isMaximized ? "Restaurar" : "Maximizar"}
        >
          {isMaximized ? (
            <Copy className="size-3 scale-x-[-1]" strokeWidth={1.75} />
          ) : (
            <Square className="size-3" strokeWidth={1.75} />
          )}
        </WindowButton>
        <WindowButton
          onClick={() => appWindow.close()}
          aria-label="Cerrar"
          variant="danger"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </WindowButton>
      </div>
    </div>
  );
}

interface WindowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger";
}

function WindowButton({
  variant = "default",
  className,
  children,
  ...props
}: WindowButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors",
        "hover:text-foreground",
        variant === "default" && "hover:bg-sidebar-accent",
        variant === "danger" && "hover:bg-destructive hover:text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
