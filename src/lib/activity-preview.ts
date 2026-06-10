/**
 * TEMPORAL — notificaciones de prueba para previsualizar campana / Inicio / taskbar.
 * Borrar este archivo y el bloque en HomeView cuando ya no haga falta.
 */

import { logActivity, startRunningJob, endRunningJob } from "@/lib/activity";

export type DemoNotificationKind =
  | "limpiador_export"
  | "limpiador_qc"
  | "cuestionario_publish"
  | "brand_audit"
  | "running_job";

/** Dispara una notificación de ejemplo (siempre no leída). */
export async function pushDemoNotification(
  kind: DemoNotificationKind
): Promise<void> {
  switch (kind) {
    case "limpiador_export":
      await logActivity({
        type: "limpiador_export",
        title: "Export guardado: Encuesta satisfacción 2026",
        body: "encuesta_satisfaccion_limpio_v2_20260520_1430.xlsx",
        toolId: "limpiador",
        viewId: "limpiador",
        payload: {
          projectId: "demo-project-id",
          versionId: "demo-version-id",
          screen: "export",
        },
      });
      break;
    case "limpiador_qc":
      await logActivity({
        type: "limpiador_qc_done",
        title: "QC terminado: Tracker YPF Abr 26",
        body: "Versión 1 · 12 flags rojos",
        toolId: "limpiador",
        viewId: "limpiador",
        payload: {
          projectId: "demo-project-id",
          screen: "project",
        },
      });
      break;
    case "cuestionario_publish":
      await logActivity({
        type: "cuestionario_published",
        title: "Publicado en QuestionPro: Cuestionario piloto",
        body: "Survey ID 12345678",
        toolId: "cuestionario",
        viewId: "cuestionario",
        payload: {
          questionnaireId: "demo-questionnaire-id",
          screen: "reporte",
        },
      });
      break;
    case "brand_audit":
      await logActivity({
        type: "brand_audit_done",
        title: "Brand Audit completado",
        body: "Documents\\MegaApp\\brand-audit\\YPF Monitor\\2026-05-20_14-30-00",
        toolId: "brand-audit",
        viewId: "brand-audit",
      });
      break;
    case "running_job":
      await startRunningJob(
        "demo-running",
        "limpiador",
        "Control de calidad · Vista previa"
      );
      await logActivity({
        type: "info",
        title: "Tarea en curso (demo)",
        body: "Aparece arriba en Inicio y en la campana al terminar otras acciones.",
        toolId: "limpiador",
        viewId: "limpiador",
      });
      window.setTimeout(() => {
        void endRunningJob("demo-running");
      }, 8000);
      break;
  }
}

export const DEMO_NOTIFICATION_LABELS: Record<
  DemoNotificationKind,
  string
> = {
  limpiador_export: "Export Limpiador",
  limpiador_qc: "QC terminado",
  cuestionario_publish: "Publicado en QP",
  brand_audit: "Brand Audit listo",
  running_job: "Tarea en curso (8 s)",
};
