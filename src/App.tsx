// Shell raíz de la aplicación: title bar custom + sidebar + área activa.

import { useEffect, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar, type ViewId } from "@/components/Toolbar";
import { UpdateDialog } from "@/components/UpdateDialog";
import { HomeView } from "@/tools/home/HomeView";
import { BrandAuditView } from "@/tools/brand-audit/BrandAuditView";
import { LimpiadorView } from "@/tools/limpiador/LimpiadorView";
import { SettingsView } from "@/tools/settings/SettingsView";
import { checkForUpdate, type Update } from "@/lib/updater";

// Versión de la app. En runtime se podría leer con `getVersion()` del plugin,
// por ahora es una constante sincronizada con tauri.conf.json / Cargo.toml.
const APP_VERSION = "1.0.2";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  // Chequeo de updates al iniciar la app. Se ejecuta una sola vez, en silencio.
  // Si hay una versión nueva, el diálogo modal se muestra y bloquea todo hasta
  // completar la actualización (política: update obligatorio).
  // Si el chequeo falla (offline, endpoint 404 pre-primer-release, etc.), se
  // loguea y se sigue normalmente — la app no puede depender del updater para
  // funcionar.
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Toolbar
          activeView={activeView}
          onSelectView={setActiveView}
          appVersion={APP_VERSION}
        />

        {/* Área de contenido principal scrolleable */}
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          {activeView === "home" && (
            <HomeView appVersion={APP_VERSION} onOpenTool={setActiveView} />
          )}
          {activeView === "brand-audit" && <BrandAuditView />}
          {activeView === "limpiador" && (
            <LimpiadorView onOpenSettings={() => setActiveView("settings")} />
          )}
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>

      {/* Dialog del auto-updater. Se autorenderiza como modal obligatorio cuando
          `pendingUpdate` deja de ser null. */}
      <UpdateDialog update={pendingUpdate} currentVersion={APP_VERSION} />
    </div>
  );
}

export default App;
