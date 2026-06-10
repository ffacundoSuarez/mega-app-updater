/**
 * Rutas estándar de salida bajo Documents\MegaApp\.
 * Todas las herramientas deberían guardar acá por defecto (con override en
 * "Guardar como…" cuando aplique).
 */

import { documentDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

export const MEGA_APP_ROOT_NAME = "MegaApp";

export async function getMegaAppRoot(): Promise<string> {
  const docs = await documentDir();
  return join(docs, MEGA_APP_ROOT_NAME);
}

/** Crea el directorio si no existe. */
export async function ensureDirectory(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

export async function getBrandAuditRoot(): Promise<string> {
  const root = await getMegaAppRoot();
  return join(root, "brand-audit");
}

export async function getLimpiadorExportsDir(projectId: string): Promise<string> {
  const root = await getMegaAppRoot();
  return join(root, "limpiador", projectId, "exports");
}

export async function getCuestionarioExportsDir(
  questionnaireId: string
): Promise<string> {
  const root = await getMegaAppRoot();
  return join(root, "cuestionario", questionnaireId, "exports");
}

/** Asegura MegaApp y devuelve la raíz (para la vista Archivos). */
export async function ensureMegaAppRoot(): Promise<string> {
  const root = await getMegaAppRoot();
  await ensureDirectory(root);
  return root;
}
