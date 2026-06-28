/** Precarga chunks de herramientas en idle para que el primer cambio sea instantáneo. */

let prefetched = false;

export function prefetchToolChunks(): void {
  if (prefetched) return;
  prefetched = true;

  const load = () => {
    void import("@/tools/brand-audit/BrandAuditView");
    void import("@/tools/limpiador/LimpiadorView");
    void import("@/tools/cuestionario/CuestionarioView");
    void import("@/tools/codificacion/CodificacionView");
    void import("@/tools/settings/SettingsView");
    void import("@/tools/files/FilesView");
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(load, { timeout: 3000 });
  } else {
    window.setTimeout(load, 500);
  }
}
