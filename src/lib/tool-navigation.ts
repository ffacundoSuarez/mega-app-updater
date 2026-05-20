/**
 * Navegación profunda desde notificaciones / actividad hacia pantallas internas
 * de cada herramienta.
 */

import type { ViewId } from "@/components/Toolbar";
import type { LimpiadorView } from "@/tools/limpiador/LimpiadorView";

export interface PendingToolNavigation {
  view: ViewId;
  payload?: Record<string, string>;
}

const LIMPIADOR_SCREENS: LimpiadorView[] = [
  "list",
  "new",
  "project",
  "upload",
  "rules",
  "review",
  "export",
];

export interface LimpiadorDeepLink {
  screen: LimpiadorView;
  projectId: string;
  versionId: string | null;
}

export function parseLimpiadorDeepLink(
  payload?: Record<string, string>
): LimpiadorDeepLink | null {
  const projectId = payload?.projectId?.trim();
  if (!projectId) return null;

  const rawScreen = payload?.screen as LimpiadorView | undefined;
  let screen: LimpiadorView = "project";
  if (rawScreen && LIMPIADOR_SCREENS.includes(rawScreen)) {
    screen = rawScreen;
  }
  if (screen === "export" || screen === "review") {
    const versionId = payload?.versionId?.trim();
    if (!versionId) screen = "project";
    else {
      return { screen, projectId, versionId };
    }
  }

  return {
    screen,
    projectId,
    versionId: payload?.versionId?.trim() ?? null,
  };
}

export type CuestionarioScreen = "list" | "nuevo" | "editor" | "reporte";

export interface CuestionarioDeepLink {
  screen: CuestionarioScreen;
  questionnaireId: string;
}

const CUESTIONARIO_SCREENS: CuestionarioScreen[] = [
  "list",
  "nuevo",
  "editor",
  "reporte",
];

export function parseCuestionarioDeepLink(
  payload?: Record<string, string>
): CuestionarioDeepLink | null {
  const questionnaireId = payload?.questionnaireId?.trim();
  if (!questionnaireId) return null;

  const raw = payload?.screen as CuestionarioScreen | undefined;
  const screen =
    raw && CUESTIONARIO_SCREENS.includes(raw) ? raw : "editor";

  return { screen, questionnaireId };
}
