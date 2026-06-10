// Shell del Validador de Cuestionarios. Mismo patrón que LimpiadorView:
// state machine simple (sin router) que navega entre pantallas internas.
//
// Screens vigentes:
//   - list    → lista de cuestionarios + acceso a "nuevo".
//   - nuevo   → wizard de creación (camino blanco / pegar texto).
//   - editor  → editor provisorio del JSON canónico (textarea crudo).
//   - reporte → último reporte de validación + botón re-validar.
//
// El editor tipado por pregunta llega en la Iteración 4 y reemplaza a
// EditorRaw; la pantalla `reporte` es donde se va a engarzar el botón
// "Publicar en QuestionPro" en la Iteración 8.

import { useEffect, useRef, useState } from "react";
import { parseCuestionarioDeepLink } from "@/lib/tool-navigation";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/settings";
import { QuestionnaireList } from "./routes/QuestionnaireList";
import { NewQuestionnaire } from "./routes/NewQuestionnaire";
import { Editor } from "./routes/Editor";
import { ValidationReport } from "./routes/ValidationReport";

type CuestionarioScreen = "list" | "nuevo" | "editor" | "reporte";

interface NavigateOpts {
  questionnaireId?: string | null;
}

export interface CuestionarioViewProps {
  /** Disponible para que un caller pueda saltar a Ajustes desde acá. */
  onOpenSettings?: () => void;
  pendingNavigation?: Record<string, string>;
  onPendingNavigationConsumed?: () => void;
}

export function CuestionarioView({
  onOpenSettings,
  pendingNavigation,
  onPendingNavigationConsumed,
}: CuestionarioViewProps) {
  const [screen, setScreen] = useState<CuestionarioScreen>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // El validador comparte el proyecto Supabase corporativo con el Limpiador,
  // así que la condición de "configurado" es la misma: hay URL + anon key.
  const [hasSupabaseKeys, setHasSupabaseKeys] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSupabaseUrl(), getSupabaseAnonKey()]).then(([url, key]) => {
      if (!cancelled) setHasSupabaseKeys(!!url && !!key);
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const navigate = (next: CuestionarioScreen, opts: NavigateOpts = {}) => {
    setScreen(next);
    if (opts.questionnaireId !== undefined) {
      setSelectedId(opts.questionnaireId);
    }
  };

  const lastConsumedNavRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingNavigation) return;
    const key = JSON.stringify(pendingNavigation);
    if (lastConsumedNavRef.current === key) return;

    const link = parseCuestionarioDeepLink(pendingNavigation);
    if (link) {
      navigate(link.screen, { questionnaireId: link.questionnaireId });
    }
    lastConsumedNavRef.current = key;
    onPendingNavigationConsumed?.();
  }, [pendingNavigation, onPendingNavigationConsumed]);

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

      {screen === "list" && (
        <QuestionnaireList
          onCreateNew={() => navigate("nuevo")}
          onOpen={(id) => navigate("editor", { questionnaireId: id })}
        />
      )}

      {screen === "nuevo" && (
        <NewQuestionnaire
          onCancel={() => navigate("list")}
          onCreated={(id) => navigate("editor", { questionnaireId: id })}
          onOpenSettings={onOpenSettings}
        />
      )}

      {screen === "editor" && selectedId && (
        <Editor
          questionnaireId={selectedId}
          onBack={() => navigate("list")}
          onOpenReport={() =>
            navigate("reporte", { questionnaireId: selectedId })
          }
        />
      )}

      {screen === "reporte" && selectedId && (
        <ValidationReport
          questionnaireId={selectedId}
          onBack={() => navigate("editor", { questionnaireId: selectedId })}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ClipboardCheck className="size-5" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Validador de Cuestionarios
        </h1>
        <p className="text-sm text-muted-foreground">
          Construí, importá y validá cuestionarios antes de lanzarlos en
          QuestionPro.
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
          Para usar el Validador de Cuestionarios necesitás cargar las
          credenciales de Supabase (URL del proyecto + anon key) en Ajustes.
          Sin ellas la app no puede leer ni escribir cuestionarios.
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
