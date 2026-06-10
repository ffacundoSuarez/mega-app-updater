/**
 * Indicador de no leídos en el ícono de la barra de tareas (Windows: overlay).
 */

import { getCurrentWindow } from "@tauri-apps/api/window";

/** Overlay en taskbar (Windows). Preferir el punto rojo chico si existe. */
const OVERLAY_ICON = "/badges/unread-dot-red.png";
const OVERLAY_FALLBACK = "/badges/unread-dot.png";

let lastUnread = 0;

/** Actualiza el overlay según cantidad de notificaciones no leídas. */
export async function syncTaskbarBadge(unreadCount: number): Promise<void> {
  if (unreadCount === lastUnread) return;
  lastUnread = unreadCount;

  try {
    const win = getCurrentWindow();
    if (unreadCount > 0) {
      try {
        await win.setOverlayIcon(OVERLAY_ICON);
      } catch {
        await win.setOverlayIcon(OVERLAY_FALLBACK);
      }
    } else {
      await win.setOverlayIcon(undefined);
    }
  } catch (err) {
    // En dev sin permiso o fuera de Windows, ignorar silenciosamente.
    console.warn("[taskbar-badge]", err);
  }
}
