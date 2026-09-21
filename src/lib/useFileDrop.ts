/**
 * Hook compartido de drag & drop de archivos para la app (Tauri 2).
 *
 * Por qué no `onDrop` de HTML5: en Tauri 2 el webview tiene
 * `dragDropEnabled: true` por defecto, así que el handler nativo del SO
 * intercepta el drop y `dataTransfer.files` queda vacío. La forma soportada es
 * escuchar el evento nativo `onDragDropEvent`, que entrega **rutas de archivo**.
 * Cada herramienta usa la ruta como ya sabe (Limpiador: se la pasa a Rust;
 * Cuestionario: lee los bytes con `@tauri-apps/plugin-fs` y arma un `File`).
 *
 * Hay un solo webview, así que el evento llega a TODOS los hooks montados. Por
 * eso cada uno se acota con `enabled` (sólo la pantalla activa escucha) y filtra
 * por extensión; como las extensiones por herramienta no se solapan
 * (`.xlsx/.xls` vs `.docx/.pdf`), no hay doble manejo de un mismo drop.
 */

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export interface UseFileDropOptions {
  /** Extensiones aceptadas (con punto), ej. `[".xlsx", ".xls"]`. */
  extensions: string[];
  /** Se llama con las rutas dropeadas que matchean alguna extensión. */
  onDrop: (paths: string[]) => void;
  /** Si es false, el hook no escucha (pantalla inactiva / ocupada). Default true. */
  enabled?: boolean;
}

/** Devuelve `isDragging` para feedback visual de la zona de drop. */
export function useFileDrop({
  extensions,
  onDrop,
  enabled = true,
}: UseFileDropOptions): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false);
  // Refs para no re-suscribir el listener en cada render (onDrop suele ser
  // una closure nueva por render).
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const extsRef = useRef(extensions);
  extsRef.current = extensions;

  useEffect(() => {
    if (!enabled) {
      setIsDragging(false);
      return;
    }
    let active = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setIsDragging(true);
        } else if (payload.type === "leave") {
          setIsDragging(false);
        } else if (payload.type === "drop") {
          setIsDragging(false);
          const exts = extsRef.current.map((e) => e.toLowerCase());
          const matched = (payload.paths ?? []).filter((p) =>
            exts.some((ext) => p.toLowerCase().endsWith(ext))
          );
          if (matched.length > 0) onDropRef.current(matched);
        }
      })
      .then((u) => {
        if (active) unlisten = u;
        else u();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [enabled]);

  return { isDragging };
}
