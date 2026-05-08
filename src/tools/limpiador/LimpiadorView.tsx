// Shell del Limpiador. Maneja la navegación entre pantallas internas con un
// state machine simple (no router): list → new → project. Cada pantalla recibe
// `onNavigate(view, projectId?)` para moverse.
//
// F1 cubre: list, new, y un placeholder en project. Las pantallas de upload,
// rules, review y export se irán llenando en iteraciones siguientes (etapa 2.B
// en adelante).

import { useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/settings";
import { ProjectList } from "./routes/ProjectList";
import { NewProject } from "./routes/NewProject";
import { ProjectDetail } from "./routes/ProjectDetail";
import { Upload } from "./routes/Upload";
import { Rules } from "./routes/Rules";

export type LimpiadorView = "list" | "new" | "project" | "upload" | "rules";

export interface LimpiadorViewProps {
  /** Disponible para que un caller pueda saltar a Ajustes desde acá. */
  onOpenSettings?: () => void;
}

export function LimpiadorView({ onOpenSettings }: LimpiadorViewProps) {
  const [view, setView] = useState<LimpiadorView>("list");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );

  // Estado de las keys de Supabase: la herramienta no funciona sin ellas.
  // Si faltan, mostramos un banner gateando todas las pantallas.
  const [hasSupabaseKeys, setHasSupabaseKeys] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSupabaseUrl(), getSupabaseAnonKey()]).then(([url, key]) => {
      if (!cancelled) setHasSupabaseKeys(!!url && !!key);
    });
    return () => {
      cancelled = true;
    };
  }, [view]); // re-chequea al cambiar de pantalla por si el user fue a Ajustes y volvió

  const navigate = (next: LimpiadorView, projectId?: string | null) => {
    setView(next);
    setSelectedProjectId(projectId ?? null);
  };

  if (hasSupabaseKeys === null) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header />
        <Separator />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!hasSupabaseKeys) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header />
        <Separator />
        <SettingsRequiredBanner onOpenSettings={onOpenSettings} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Header />
      <Separator />

      {view === "list" && (
        <ProjectList
          onCreateNew={() => navigate("new")}
          onOpenProject={(id) => navigate("project", id)}
        />
      )}

      {view === "new" && (
        <NewProject
          onCancel={() => navigate("list")}
          onCreated={(projectId) => navigate("project", projectId)}
          onOpenSettings={onOpenSettings}
        />
      )}

      {view === "project" && selectedProjectId && (
        <ProjectDetail
          projectId={selectedProjectId}
          onBack={() => navigate("list")}
          onUpload={() => navigate("upload", selectedProjectId)}
          onOpenRules={() => navigate("rules", selectedProjectId)}
        />
      )}

      {view === "upload" && selectedProjectId && (
        <Upload
          projectId={selectedProjectId}
          onCancel={() => navigate("project", selectedProjectId)}
          onUploaded={() => navigate("project", selectedProjectId)}
          onOpenSettings={onOpenSettings}
        />
      )}

      {view === "rules" && selectedProjectId && (
        <Rules
          projectId={selectedProjectId}
          onBack={() => navigate("project", selectedProjectId)}
          onGoToUpload={() => navigate("upload", selectedProjectId)}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Limpiador de Encuestas
        </h1>
        <p className="text-sm text-muted-foreground">
          Identifica y elimina respuestas inválidas o sospechosas usando IA.
        </p>
      </div>
    </div>
  );
}

function SettingsRequiredBanner({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-400">
          <AlertTriangle className="size-4" />
          Configuración pendiente
        </CardTitle>
        <CardDescription>
          Para usar el Limpiador necesitás cargar las credenciales de Supabase
          (URL del proyecto + anon key) en Ajustes. Sin ellas la app no puede
          leer ni escribir proyectos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {onOpenSettings ? (
          <Button onClick={onOpenSettings}>Ir a Ajustes</Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Abrí <span className="font-mono">Ajustes</span> en la barra lateral.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
