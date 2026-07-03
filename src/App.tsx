// Shell raíz de la aplicación: title bar custom + sidebar + área activa.



import {

  lazy,

  memo,

  Suspense,

  useCallback,

  useEffect,

  useMemo,

  useState,

  type ComponentType,

} from "react";

import { Toaster } from "sonner";

import { TitleBar } from "@/components/TitleBar";

import { Toolbar, type ToolId, type ViewId } from "@/components/Toolbar";

import { UpdateDialog } from "@/components/UpdateDialog";

import { ToolErrorBoundary } from "@/components/ToolErrorBoundary";

import { ViewSlot } from "@/components/ViewSlot";

import { Skeleton } from "@/components/ui/skeleton";

import { ActivityProvider } from "@/lib/activity-context";

import { prefetchToolChunks } from "@/lib/prefetch-tools";

import type { PendingToolNavigation } from "@/lib/tool-navigation";

import { checkForUpdate, type Update } from "@/lib/updater";
import type { LimpiadorViewProps } from "@/tools/limpiador/LimpiadorView";

import type { CodificacionViewProps } from "@/tools/codificacion/CodificacionView";



const APP_VERSION = "1.2.1";



const HomeView = lazy(() =>

  import("@/tools/home/HomeView").then((m) => ({ default: m.HomeView }))

);

const BrandAuditView = lazy(() =>

  import("@/tools/brand-audit/BrandAuditView").then((m) => ({

    default: m.BrandAuditView,

  }))

);

const LimpiadorView = lazy(() =>

  import("@/tools/limpiador/LimpiadorView").then((m) => ({

    default: m.LimpiadorView,

  }))

);

const CuestionarioView = lazy(() =>

  import("@/tools/cuestionario/CuestionarioView").then((m) => ({

    default: m.CuestionarioView,

  }))

);

const CodificacionView = lazy(() =>

  import("@/tools/codificacion/CodificacionView").then((m) => ({

    default: m.CodificacionView,

  }))

);

const SettingsView = lazy(() =>

  import("@/tools/settings/SettingsView").then((m) => ({

    default: m.SettingsView,

  }))

);

const FilesView = lazy(() =>

  import("@/tools/files/FilesView").then((m) => ({ default: m.FilesView }))

);



const TOOL_VIEWS: ToolId[] = [

  "brand-audit",

  "limpiador",

  "cuestionario",

  "codificacion",

];



function isToolView(view: ViewId): view is ToolId {

  return TOOL_VIEWS.includes(view as ToolId);

}



/** Skeleton genérico mientras carga un chunk lazy de herramienta. */

function ViewLoadingFallback() {

  return (

    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">

      <Skeleton className="h-8 w-40" />

      <Skeleton className="h-4 w-72" />

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">

        <Skeleton className="h-28 rounded-xl" />

        <Skeleton className="h-28 rounded-xl" />

        <Skeleton className="h-28 rounded-xl" />

        <Skeleton className="h-28 rounded-xl" />

      </div>

    </div>

  );

}



/** Lazy + Suspense aislado por vista (no bloquea el resto del shell). */

function withSuspense<P extends object>(

  LazyComponent: ComponentType<P>

): ComponentType<P> {

  function Suspended(props: P) {

    return (

      <Suspense fallback={<ViewLoadingFallback />}>

        <LazyComponent {...props} />

      </Suspense>

    );

  }

  return Suspended;

}



const HomeScreen = withSuspense(HomeView);

const FilesScreen = withSuspense(FilesView);

const BrandAuditScreen = withSuspense(BrandAuditView);

const LimpiadorScreen = withSuspense(LimpiadorView);

const CuestionarioScreen = withSuspense(CuestionarioView);

const SettingsScreen = withSuspense(SettingsView);



function CodificacionScreen(props: CodificacionViewProps) {

  return (

    <Suspense fallback={<ViewLoadingFallback />}>

      <ToolErrorBoundary toolName="Codificación">

        <CodificacionView {...props} />

      </ToolErrorBoundary>

    </Suspense>

  );

}



function AppShell() {

  const [activeView, setActiveView] = useState<ViewId>("home");

  const [visitedViews, setVisitedViews] = useState<Set<ViewId>>(

    () => new Set(["home"])

  );

  const [filesHighlightPath, setFilesHighlightPath] = useState<string | null>(

    null

  );

  const [pendingToolNav, setPendingToolNav] =

    useState<PendingToolNavigation | null>(null);

  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);



  useEffect(() => {

    setVisitedViews((prev) => {

      if (prev.has(activeView)) return prev;

      const next = new Set(prev);

      next.add(activeView);

      return next;

    });

  }, [activeView]);



  useEffect(() => {

    prefetchToolChunks();

  }, []);



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



  const openSettings = useCallback(() => {

    setActiveView("settings");

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



  const handleSelectView = useCallback((v: ViewId) => {

    if (v !== "files") setFilesHighlightPath(null);

    setPendingToolNav((prev) => (prev?.view === v ? prev : null));

    setActiveView(v);

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



  const homeProps = useMemo(

    () => ({

      appVersion: APP_VERSION,

      onOpenTool: (tool: ToolId) => handleNavigate(tool),

      onOpenView: handleNavigate,

      onOpenFiles: handleOpenFiles,

    }),

    [handleNavigate, handleOpenFiles]

  );



  const filesProps = useMemo(

    () => ({ highlightPath: filesHighlightPath }),

    [filesHighlightPath]

  );



  const limpiadorProps = useMemo<LimpiadorViewProps>(

    () => ({

      onOpenSettings: openSettings,

      pendingNavigation: limpiadorPending,

      onPendingNavigationConsumed: clearPendingToolNav,

    }),

    [openSettings, limpiadorPending, clearPendingToolNav]

  );



  const cuestionarioProps = useMemo(

    () => ({

      onOpenSettings: openSettings,

      pendingNavigation: cuestionarioPending,

      onPendingNavigationConsumed: clearPendingToolNav,

    }),

    [openSettings, cuestionarioPending, clearPendingToolNav]

  );



  const codificacionProps = useMemo<CodificacionViewProps>(

    () => ({ onOpenSettings: openSettings }),

    [openSettings]

  );



  const brandAuditProps = useMemo(() => ({}), []);

  const settingsProps = useMemo(() => ({}), []);



  return (

    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">

      <TitleBar onNavigate={handleNavigate} onOpenFiles={handleOpenFiles} />



      <div className="flex min-h-0 flex-1">

        <Toolbar

          activeView={activeView}

          onSelectView={handleSelectView}

          appVersion={APP_VERSION}

        />



        <main className="relative min-w-0 flex-1 overflow-y-auto p-8">

          {visitedViews.has("home") && (

            <ViewSlot

              active={activeView === "home"}

              viewId="home"

              Component={HomeScreen}

              componentProps={homeProps}

            />

          )}



          {visitedViews.has("files") && (

            <ViewSlot

              active={activeView === "files"}

              viewId="files"

              Component={FilesScreen}

              componentProps={filesProps}

            />

          )}



          {visitedViews.has("brand-audit") && (

            <ViewSlot

              active={activeView === "brand-audit"}

              viewId="brand-audit"

              Component={BrandAuditScreen}

              componentProps={brandAuditProps}

            />

          )}



          {visitedViews.has("limpiador") && (

            <ViewSlot

              active={activeView === "limpiador"}

              viewId="limpiador"

              Component={LimpiadorScreen}

              componentProps={limpiadorProps}

              fill

            />

          )}



          {visitedViews.has("cuestionario") && (

            <ViewSlot

              active={activeView === "cuestionario"}

              viewId="cuestionario"

              Component={CuestionarioScreen}

              componentProps={cuestionarioProps}

            />

          )}



          {visitedViews.has("codificacion") && (

            <ViewSlot

              active={activeView === "codificacion"}

              viewId="codificacion"

              Component={CodificacionScreen}

              componentProps={codificacionProps}

            />

          )}



          {visitedViews.has("settings") && (

            <ViewSlot

              active={activeView === "settings"}

              viewId="settings"

              Component={SettingsScreen}

              componentProps={settingsProps}

            />

          )}

        </main>

      </div>



      <UpdateDialog update={pendingUpdate} currentVersion={APP_VERSION} />

      <Toaster richColors closeButton position="bottom-right" />

    </div>

  );

}



function App() {

  return (

    <ActivityProvider>

      <MemoAppShell />

    </ActivityProvider>

  );

}



const MemoAppShell = memo(AppShell);



export default App;


