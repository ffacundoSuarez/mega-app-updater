// Wrapper del plugin `@tauri-apps/plugin-updater` + `plugin-process`.
//
// Flujo de alto nivel que expone este módulo:
//   1. `checkForUpdate()` → consulta el endpoint de releases. Puede devolver null
//      (no hay update), un Update (hay nueva versión) o tirar (error de red /
//      endpoint no disponible → caso habitual antes de publicar el primer release).
//   2. `installUpdate(update, onProgress)` → descarga el MSI, verifica su firma
//      Ed25519 contra la pubkey embebida (lo hace el plugin por nosotros) y
//      dispara la instalación en modo `passive`. El runtime cierra la app.
//   3. `relaunchApp()` → relanza la app en la nueva versión. En la práctica,
//      con `installMode: passive` Windows reabre la app solo, así que esto se
//      llama como fallback por si el installer no lo hace.
//
// IMPORTANTE: la política de la app es que el update es OBLIGATORIO (no hay
// botón "Más tarde"), así que la UI que consume este wrapper debe bloquear al
// usuario hasta que `installUpdate` termine.

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Re-export del tipo del plugin para uso en la UI sin tener que importar el plugin directo. */
export type { Update };

/** Callback de progreso durante la descarga del MSI. */
export type DownloadProgressCallback = (downloaded: number, total: number) => void;

/**
 * Chequea si hay una versión nueva disponible.
 *
 * - Devuelve `null` si la app ya está en la última versión.
 * - Devuelve un `Update` si hay una versión superior publicada.
 * - Puede tirar si el endpoint no responde (offline, 404 pre-primer-release,
 *   PAT inválido, etc.). El caller decide si mostrar el error o ignorarlo.
 */
export async function checkForUpdate(): Promise<Update | null> {
  return await check();
}

/**
 * Descarga e instala el update. El plugin hace:
 *   - Descarga del asset listado en `latest.json`.
 *   - Verificación de firma Ed25519 contra la pubkey en `tauri.conf.json`.
 *   - Ejecución del instalador en modo `passive` (Windows muestra progreso).
 *
 * El proceso cierra la app al final. Esta promesa normalmente no termina de
 * forma "normal" en Windows: la app es killeada por el installer.
 */
export async function installUpdate(
  update: Update,
  onProgress?: DownloadProgressCallback,
): Promise<void> {
  let downloaded = 0;
  let total = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress?.(0, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength ?? 0;
      onProgress?.(downloaded, total);
    } else if (event.event === "Finished") {
      onProgress?.(total, total);
    }
  });

  // En algunos escenarios el installer no relanza la app (ej. si el usuario
  // cerró la ventana del MSI). Forzamos relanzar.
  await relaunch();
}
