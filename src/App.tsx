// Shell raíz de la aplicación: title bar custom + sidebar + área activa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar, type ToolId, type ViewId } from "@/components/Toolbar";
import { UpdateDialog } from "@/components/UpdateDialog";
import { ToolErrorBoundary } from "@/components/ToolErrorBoundary";
import { ActivityProvider } from "@/lib/activity-context";
import type { PendingToolNavigation } from "@/lib/tool-navigation";
import { HomeView } from "@/tools/home/HomeView";
import { BrandAuditView } from "@/tools/brand-audit/BrandAuditView";
import { LimpiadorView } from "@/tools/limpiador/LimpiadorView";
import { CuestionarioView } from "@/tools/cuestionario/CuestionarioView";
import { CodificacionView } from "@/tools/codificacion/CodificacionView";
import { SettingsView } from "@/tools/settings/SettingsView";
import { FilesView } from "@/tools/files/FilesView";
import { checkForUpdate, type Update } from "@/lib/updater";

const APP_VERSION = "1.1.0";

const TOOL_VIEWS: ToolId[] = [
  "brand-audit",
  "limpiador",
  "cuestionario",
  "codificacion",
];

function isToolView(view: ViewId): view is ToolId {
  return TOOL_VIEWS.includes(view as ToolId);
}

function AppShell() {
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [filesHighlightPath, setFilesHighlightPath] = useState<string | null>(
    null
  );
  const [pendingToolNav, setPendingToolNav] =
    useState<PendingToolNavigation | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate()
      .then((update) => {
        if (!cancelled && update) {
          setPendingUpdate(update);
        }
      })
      .catch((err) => {
        console.warn("[updater] check falló, se sigue sin actualizar:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = useCallback(
    (view: ViewId, payload?: Record<string, string>) => {
      if (payload && Object.keys(payload).length > 0 && isToolView(view)) {
        setPendingToolNav({ view, payload });
      } else {
        setPendingToolNav(null);
      }
      setActiveView(view);
    },
    []
  );

  const handleOpenFiles = useCallback((path?: string) => {
    setFilesHighlightPath(path ?? null);
    setPendingToolNav(null);
    setActiveView("files");
  }, []);

  const clearPendingToolNav = useCallback(() => {
    setPendingToolNav(null);
  }, []);

  const limpiadorPending = useMemo(
    () =>
      pendingToolNav?.view === "limpiador"
        ? pendingToolNav.payload
        : undefined,
    [pendingToolNav]
  );

  const cuestionarioPending = useMemo(
    () =>
      pendingToolNav?.view === "cuestionario"
        ? pendingToolNav.payload
        : undefined,
    [pendingToolNav]
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar onNavigate={handleNavigate} onOpenFiles={handleOpenFiles} />

      <div className="flex min-h-0 flex-1">
        <Toolbar
          activeView={activeView}
          onSelectView={(v) => {
            if (v !== "files") setFilesHighlightPath(null);
            if (v !== pendingToolNav?.view) setPendingToolNav(null);
            setActiveView(v);
          }}
          appVersion={APP_VERSION}
        />

        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          {activeView === "home" && (
            <HomeView
              appVersion={APP_VERSION}
              onOpenTool={(tool) => handleNavigate(tool)}
              onOpenView={handleNavigate}
              onOpenFiles={handleOpenFiles}
            />
          )}
          {activeView === "files" && (
            <FilesView highlightPath={filesHighlightPath} />
          )}
          {activeView === "brand-audit" && <BrandAuditView />}
          {activeView === "limpiador" && (
            <LimpiadorView
              onOpenSettings={() => setActiveView("settings")}
              pendingNavigation={limpiadorPending}
              onPendingNavigationConsumed={clearPendingToolNav}
            />
          )}
          {activeView === "cuestionario" && (
            <CuestionarioView
              onOpenSettings={() => setActiveView("settings")}
              pendingNavigation={cuestionarioPending}
              onPendingNavigationConsumed={clearPendingToolNav}
            />
          )}
          {activeView === "codificacion" && (
            <ToolErrorBoundary toolName="Codificación">
              <CodificacionView
                onOpenSettings={() => setActiveView("settings")}
              />
            </ToolErrorBoundary>
          )}
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>

      <UpdateDialog update={pendingUpdate} currentVersion={APP_VERSION} />
    </div>
  );
}

function App() {
  return (
    <ActivityProvider>
      <AppShell />
    </ActivityProvider>
  );
}

export default App;
