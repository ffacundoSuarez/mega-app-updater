// Detalle de un proyecto del Limpiador. Muestra metadata del proyecto +
// lista de versiones cargadas. El botón "Subir nueva versión" lleva a la
// pantalla Upload (etapas 2.B + 2.C).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Upload as UploadIcon,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getLimpiadorDebugPrompts } from "@/lib/settings";
import { getProject } from "@/lib/cleaning/projects-repository";
import {
  deleteVersion,
  listVersions,
} from "@/lib/cleaning/versions-repository";
import {
  runCleaningJob,
  type CleaningJobController,
  type CleaningJobProgress,
} from "@/lib/cleaning/cleaning-job";
import type {
  CleaningProject,
  CleaningVersion,
  VersionStatus,
} from "@/lib/cleaning/types";

export interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onUpload: () => void;
  onOpenRules: () => void;
  onOpenReview: (versionId: string) => void;
  onOpenExport: (versionId: string) => void;
}

export function ProjectDetail({
  projectId,
  onBack,
  onUpload,
  onOpenRules,
  onOpenReview,
  onOpenExport,
}: ProjectDetailProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [versions, setVersions] = useState<CleaningVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Solo permitimos un QC corriendo a la vez desde esta pantalla. El controller
  // queda en un ref para que cancel() siga funcionando aunque el state se
  // actualice; el progreso (live) se renderiza desde activeJob.
  const [activeJob, setActiveJob] = useState<{
    versionId: string;
    progress: CleaningJobProgress | null;
    jobError: string | null;
  } | null>(null);
  const jobControllerRef = useRef<CleaningJobController | null>(null);
  // Modo debug del Limpiador (Ajustes): si está activo, el QC vuelca prompts a
  // la consola. Lo leemos una vez al montar; al lanzar un job miramos el ref.
  const debugPromptsRef = useRef(false);
  useEffect(() => {
    void getLimpiadorDebugPrompts().then((v) => {
      debugPromptsRef.current = v;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, v] = await Promise.all([
        getProject(projectId),
        listVersions(projectId),
      ]);
      setProject(p);
      setVersions(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRunQC = useCallback(
    (version: CleaningVersion) => {
      if (jobControllerRef.current) return; // ya hay uno corriendo

      setActiveJob({ versionId: version.id, progress: null, jobError: null });

      const controller = runCleaningJob(version.id, {
        onProgress: (progress) => {
          setActiveJob((curr) =>
            curr && curr.versionId === version.id
              ? { ...curr, progress }
              : curr
          );
        },
        debugPromptLogger: debugPromptsRef.current
          ? (entry) => {
              // console.log (no console.debug): devtools oculta el nivel
              // "Verbose" por defecto y el usuario que activó el modo debug
              // quiere ver estos volcados sin tocar configuración de la consola.
              console.log(
                `%c[limpiador:debug] batch #${entry.batchIndex ?? "?"} ` +
                  `(${entry.rowCount} filas, modelo ${entry.model})`,
                "color:#0ea5e9;font-weight:bold",
                `\n--- SYSTEM ---\n${entry.systemPrompt}\n` +
                  `--- USER ---\n${entry.userPrompt}\n` +
                  `--- RESPONSE ---\n${entry.rawResponse ?? "(vacía)"}`
              );
            }
          : undefined,
      });
      jobControllerRef.current = controller;

      controller.promise
        .then((result) => {
          if (result.status === "error" && result.errorMessage) {
            setActiveJob((curr) =>
              curr && curr.versionId === version.id
                ? { ...curr, jobError: result.errorMessage ?? null }
                : curr
            );
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          setActiveJob((curr) =>
            curr && curr.versionId === version.id
              ? { ...curr, jobError: message }
              : curr
          );
        })
        .finally(() => {
          jobControllerRef.current = null;
          // Recargamos para que el status/processed_rows reflejen lo persistido.
          void load();
          // Limpiamos el activeJob un toque después para que el usuario alcance
          // a ver el último mensaje de error si hubo.
          setTimeout(() => {
            setActiveJob((curr) =>
              curr && curr.versionId === version.id ? null : curr
            );
          }, 1500);
        });
    },
    [load]
  );

  const handleCancelQC = useCallback(() => {
    jobControllerRef.current?.cancel();
  }, []);

  const handleDeleteVersion = useCallback(
    async (version: CleaningVersion) => {
      const confirmed = window.confirm(
        `¿Eliminar la versión ${version.version_number} ` +
          `(${version.filename})?\n\n` +
          "Se borran en cascada todas las filas y flags asociados. Esta " +
          "acción no se puede deshacer."
      );
      if (!confirmed) return;

      setDeleting((s) => new Set(s).add(version.id));
      try {
        await deleteVersion(version.id);
        await load();
      } catch (err) {
        window.alert(
          `No se pudo eliminar la versión: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setDeleting((s) => {
          const next = new Set(s);
          next.delete(version.id);
          return next;
        });
      }
    },
    [load]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver a la lista
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando proyecto…
        </div>
      )}

      {error && !loading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              <span className="font-medium">No se pudo cargar el proyecto</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {error}
            </pre>
          </CardContent>
        </Card>
      )}

      {project && !loading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <FolderOpen className="size-5 text-primary" />
                {project.name}
                <Badge variant="secondary" className="font-normal">
                  {project.source === "questionpro"
                    ? "QuestionPro"
                    : "Qualtrics"}
                </Badge>
              </CardTitle>
              {project.description && (
                <CardDescription>{project.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {project.source === "questionpro" && project.qp_survey_name && (
                <div>
                  Encuesta QP:{" "}
                  <span className="font-medium text-foreground">
                    {project.qp_survey_name}
                  </span>{" "}
                  <span className="font-mono text-xs">
                    (ID {project.qp_survey_id})
                  </span>
                </div>
              )}
              <div>
                Creado: {new Date(project.created_at).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Versiones</CardTitle>
                <CardDescription>
                  Cada versión es un Excel cargado para limpiar. Podés tener
                  varias por proyecto (rondas, ediciones).
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  onClick={onOpenRules}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Filter className="size-4" />
                  Reglas
                </Button>
                <Button onClick={onUpload} size="sm" className="gap-2">
                  <UploadIcon className="size-4" />
                  Subir nueva versión
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                  <FileSpreadsheet className="size-8 opacity-50" />
                  <p>Todavía no hay versiones cargadas.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {versions.map((v) => {
                    const isActive = activeJob?.versionId === v.id;
                    return (
                      <VersionRow
                        key={v.id}
                        version={v}
                        deleting={deleting.has(v.id)}
                        onDelete={() => void handleDeleteVersion(v)}
                        onOpenReview={() => onOpenReview(v.id)}
                        onOpenExport={() => onOpenExport(v.id)}
                        onRunQC={() => handleRunQC(v)}
                        onCancelQC={handleCancelQC}
                        isJobRunning={isActive}
                        liveProgress={isActive ? activeJob?.progress ?? null : null}
                        liveError={isActive ? activeJob?.jobError ?? null : null}
                        anyJobRunning={activeJob !== null}
                      />
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface VersionRowProps {
  version: CleaningVersion;
  deleting: boolean;
  onDelete: () => void;
  onOpenReview: () => void;
  onOpenExport: () => void;
  onRunQC: () => void;
  onCancelQC: () => void;
  isJobRunning: boolean;
  liveProgress: CleaningJobProgress | null;
  liveError: string | null;
  anyJobRunning: boolean;
}

function VersionRow({
  version,
  deleting,
  onDelete,
  onOpenReview,
  onOpenExport,
  onRunQC,
  onCancelQC,
  isJobRunning,
  liveProgress,
  liveError,
  anyJobRunning,
}: VersionRowProps) {
  // Review tiene sentido si el motor ya generó al menos progreso.
  // Export sólo cuando completó OK (sin flags pendientes / error).
  const canReview =
    version.status === "completed" ||
    version.status === "processing" ||
    version.status === "error";
  const canExport = version.status === "completed";

  // Pending → Ejecutar QC. Error → Reanudar (el motor levanta desde
  // processed_rows). Processing sin job activo en esta sesión → también dejamos
  // reanudar por si quedó colgado de un cierre anterior.
  const canRunQC =
    !isJobRunning &&
    !anyJobRunning &&
    (version.status === "pending" ||
      version.status === "error" ||
      version.status === "processing");

  const runLabel =
    version.status === "pending" ? "Ejecutar QC" : "Reanudar QC";
  const RunIcon = version.status === "pending" ? Play : RefreshCw;

  // Mientras el job corre en esta sesión, el progreso live pisa al de la BD.
  const displayProgress = isJobRunning && liveProgress
    ? liveProgress.progressPercentage
    : version.progress_percentage ?? 0;
  const showProgress = isJobRunning || version.status === "processing";

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-mono">
          v{version.version_number}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={version.filename}>
            {version.filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {version.total_rows} filas · creada{" "}
            {new Date(version.created_at).toLocaleString()}
          </p>
          {showProgress && (
            <div className="mt-1.5 flex items-center gap-2">
              <Progress value={displayProgress} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground">
                {displayProgress}%
              </span>
            </div>
          )}
          {isJobRunning && liveProgress && (
            <p className="mt-1 text-xs text-muted-foreground">
              {liveProgress.processedRows} / {liveProgress.totalRows} filas ·{" "}
              {liveProgress.totalFlagged} flags
            </p>
          )}
          {liveError && (
            <p
              className="mt-1 truncate text-xs text-destructive"
              title={liveError}
            >
              {liveError}
            </p>
          )}
          {!liveError && version.error_message && (
            <p
              className="mt-1 truncate text-xs text-destructive"
              title={version.error_message}
            >
              {version.error_message}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={version.status} />
        {isJobRunning ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancelQC}
            className="gap-1"
          >
            <Square className="size-4" />
            Cancelar
          </Button>
        ) : (
          canRunQC && (
            <Button size="sm" onClick={onRunQC} className="gap-1">
              <RunIcon className="size-4" />
              {runLabel}
            </Button>
          )
        )}
        {canReview && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenReview}
            className="gap-1"
          >
            <ClipboardList className="size-4" />
            Revisar
          </Button>
        )}
        {canExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenExport}
            className="gap-1"
          >
            <Download className="size-4" />
            Exportar
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={deleting || isJobRunning}
          aria-label="Eliminar versión"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: VersionStatus }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <CheckCircle2 className="size-3 text-emerald-500" />
          Completada
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Loader2 className="size-3 animate-spin" />
          Procesando
        </Badge>
      );
    case "error":
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <XCircle className="size-3 text-destructive" />
          Error
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Clock className="size-3 text-muted-foreground" />
          Pendiente
        </Badge>
      );
  }
}
