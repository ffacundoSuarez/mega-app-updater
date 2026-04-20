// Shell raíz de la aplicación: title bar custom + sidebar + área activa.

import { useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar, type ViewId } from "@/components/Toolbar";
import { HomeView } from "@/tools/home/HomeView";
import { ExcelToPptxView } from "@/tools/excel-to-pptx/ExcelToPptxView";

// Versión de la app. En runtime se podría leer con `getVersion()` del plugin,
// por ahora es una constante sincronizada con tauri.conf.json / Cargo.toml.
const APP_VERSION = "0.1.0";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("home");

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
          {activeView === "excel-to-pptx" && <ExcelToPptxView />}
        </main>
      </div>
    </div>
  );
}

export default App;
