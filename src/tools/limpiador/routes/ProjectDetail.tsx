// Detalle de un proyecto del Limpiador. Muestra metadata del proyecto +
// lista de versiones cargadas. El botón "Subir nueva versión" lleva a la
// pantalla Upload (etapas 2.B + 2.C).
//
// Reglas, review y export se completan en iteraciones siguientes (paso 3 y
// paso 5 del plan).

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  Loader2,
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
import { getProject } from "@/lib/cleaning/projects-repository";
import {
  deleteVersion,
  listVersions,
} from "@/lib/cleaning/versions-repository";
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
}

export function ProjectDetail({
  projectId,
  onBack,
  onUpload,
  onOpenRules,
}: ProjectDetailProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [versions, setVersions] = useState<CleaningVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

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
                  {versions.map((v) => (
                    <VersionRow
                      key={v.id}
                      version={v}
                      deleting={deleting.has(v.id)}
                      onDelete={() => void handleDeleteVersion(v)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Próximos pasos</CardTitle>
              <CardDescription>
                Reglas, ejecución de QC, dashboard de revisión y export se
                arman en las siguientes iteraciones (paso 3 y paso 5 del
                plan).
              </CardDescription>
            </CardHeader>
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
}

function VersionRow({ version, deleting, onDelete }: VersionRowProps) {
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
          {version.status === "processing" && (
            <div className="mt-1.5 flex items-center gap-2">
              <Progress
                value={version.progress_percentage ?? 0}
                className="h-1.5 flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {version.progress_percentage ?? 0}%
              </span>
            </div>
          )}
          {version.error_message && (
            <p
              className="mt-1 truncate text-xs text-destructive"
              title={version.error_message}
            >
              {version.error_message}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={version.status} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={deleting}
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
