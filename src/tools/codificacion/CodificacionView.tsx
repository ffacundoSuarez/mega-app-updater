// Shell de Codificación: state machine interna (sin router).

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Tags } from "lucide-react";
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
  getOpenaiApiKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/settings";
import { JobList } from "./routes/JobList";
import { NewJob } from "./routes/NewJob";
import { NewProject } from "./routes/NewProject";
import { SampleTraining } from "./routes/SampleTraining";
import { AnalysisSummary } from "./routes/AnalysisSummary";
import { CategoryDetail } from "./routes/CategoryDetail";

export type CodificacionScreen =
  | "list"
  | "new-project"
  | "new-job"
  | "samples"
  | "analysis"
  | "category";

interface NavigateOpts {
  jobId?: string | null;
  projectId?: string | null;
  categoryId?: number | null;
}

export interface CodificacionViewProps {
  onOpenSettings?: () => void;
}

export function CodificacionView({ onOpenSettings }: CodificacionViewProps) {
  const [screen, setScreen] = useState<CodificacionScreen>("list");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);

  const checkKeys = useCallback(async () => {
    setKeysError(null);
    try {
      const [url, key, openai] = await Promise.all([
        getSupabaseUrl(),
        getSupabaseAnonKey(),
        getOpenaiApiKey(),
      ]);
      setHasKeys(!!url && !!key && !!openai);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : String(err));
      setHasKeys(false);
    }
  }, []);

  useEffect(() => {
    void checkKeys();
  }, [screen, checkKeys]);

  const navigate = useCallback((next: CodificacionScreen, opts: NavigateOpts = {}) => {
    setScreen(next);
    if (opts.jobId !== undefined) setSelectedJobId(opts.jobId);
    if (opts.projectId !== undefined) setSelectedProjectId(opts.projectId);
    if (opts.categoryId !== undefined) setSelectedCategoryId(opts.categoryId);
  }, []);

  if (hasKeys === null) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Header />
        <Separator />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!hasKeys) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Header />
        <Separator />
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-amber-600" />
              {keysError ? "Error al leer Ajustes" : "Configuración requerida"}
            </CardTitle>
            <CardDescription>
              {keysError ??
                "Codificación necesita Supabase URL, anon key y OpenAI API key en Ajustes (las mismas que usa el Limpiador)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            {onOpenSettings && (
              <Button onClick={onOpenSettings}>Ir a Ajustes</Button>
            )}
            <Button variant="outline" onClick={() => void checkKeys()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Header />
      <Separator />

      {screen === "list" && (
        <JobList
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onNewProject={() => navigate("new-project")}
          onNewJob={(projectId) =>
            navigate("new-job", { projectId: projectId ?? selectedProjectId })
          }
          onOpenSamples={(jobId) => navigate("samples", { jobId })}
          onOpenAnalysis={(jobId) => navigate("analysis", { jobId })}
          onRefreshKeys={checkKeys}
        />
      )}

      {screen === "new-project" && (
        <NewProject
          onCancel={() => navigate("list")}
          onCreated={(projectId) => {
            setSelectedProjectId(projectId);
            navigate("list", { projectId });
          }}
        />
      )}

      {screen === "new-job" && (
        <NewJob
          initialProjectId={selectedProjectId}
          onCancel={() => navigate("list", { projectId: selectedProjectId })}
          onCreated={(jobId) => navigate("samples", { jobId })}
        />
      )}

      {screen === "samples" && selectedJobId && (
        <SampleTraining
          jobId={selectedJobId}
          onBack={() => navigate("list")}
          onComplete={() => navigate("list", { jobId: selectedJobId })}
        />
      )}

      {screen === "analysis" && selectedJobId && (
        <AnalysisSummary
          jobId={selectedJobId}
          onBack={() => navigate("list")}
          onOpenCategory={(categoryId) =>
            navigate("category", { jobId: selectedJobId, categoryId })
          }
        />
      )}

      {screen === "category" &&
        selectedJobId &&
        selectedCategoryId !== null && (
          <CategoryDetail
            jobId={selectedJobId}
            categoryId={selectedCategoryId}
            onBack={() => navigate("analysis", { jobId: selectedJobId })}
          />
        )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Tags className="size-7 text-primary" />
        Codificación
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Clasificación automática de respuestas abiertas con libro de códigos e
        IA. Los datos se guardan en el mismo Supabase del dashboard.
      </p>
    </div>
  );
}
