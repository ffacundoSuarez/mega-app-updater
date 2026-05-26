import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Download,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  runClassificationJob,
  type ClassificationJobController,
} from "@/lib/codificacion/classification-job";
import { exportAllProjectResults, exportJobResults } from "@/lib/codificacion/export";
import { deleteJob, listJobsWithProjects } from "@/lib/codificacion/jobs-repository";
import { listProjects } from "@/lib/codificacion/projects-repository";
import type { CodificacionJobWithProject, CodificacionProject } from "@/lib/codificacion/types";

export interface JobListProps {
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onNewProject: () => void;
  onNewJob: (projectId: string | null) => void;
  onOpenSamples: (jobId: string) => void;
  onOpenAnalysis: (jobId: string) => void;
  onRefreshKeys: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Completado",
  error: "Error",
  pending_categories: "Sin categorías",
};

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "processing") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

export function JobList({
  selectedProjectId,
  onSelectProject,
  onNewProject,
  onNewJob,
  onOpenSamples,
  onOpenAnalysis,
}: JobListProps) {
  const [jobs, setJobs] = useState<CodificacionJobWithProject[]>([]);
  const [projects, setProjects] = useState<CodificacionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    jobId: string;
    percent: number;
    processed: number;
    total: number;
  } | null>(null);

  const controllerRef = useRef<ClassificationJobController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobRows, projectRows] = await Promise.all([
        listJobsWithProjects(),
        listProjects(),
      ]);
      setJobs(jobRows);
      setProjects(projectRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      controllerRef.current?.cancel();
    };
  }, []);

  const handleRunJob = async (job: CodificacionJobWithProject) => {
    if (!job.sample_training_completed) {
      window.alert("Completá el entrenamiento de muestras antes de codificar.");
      onOpenSamples(job.id);
      return;
    }
    if (activeJobId) {
      window.alert("Ya hay una codificación en curso.");
      return;
    }

    setActiveJobId(job.id);
    setProgress({
      jobId: job.id,
      percent: job.progress_percentage,
      processed: job.processed_responses,
      total: job.total_responses,
    });

    const controller = runClassificationJob(job.id, {
      onProgress: (ev) => {
        setProgress({
          jobId: ev.jobId,
          percent: ev.progress,
          processed: ev.processed,
          total: ev.total,
        });
      },
    });
    controllerRef.current = controller;

    try {
      const result = await controller.promise;
      if (result.status === "completed") {
        window.alert("Codificación completada.");
      } else if (result.status === "cancelled") {
        window.alert("Codificación cancelada.");
      } else if (result.message) {
        window.alert(result.message);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      controllerRef.current = null;
      setActiveJobId(null);
      setProgress(null);
      await load();
    }
  };

  const handleCancel = () => {
    controllerRef.current?.cancel();
  };

  const handleDelete = async (job: CodificacionJobWithProject) => {
    if (activeJobId === job.id) {
      window.alert("Cancelá la codificación en curso antes de eliminar.");
      return;
    }
    const ok = window.confirm(
      `¿Eliminar "${job.question}"?\n\nSe borran respuestas, categorías y clasificaciones.`
    );
    if (!ok) return;

    setDeleting((s) => new Set(s).add(job.id));
    try {
      await deleteJob(job.id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting((s) => {
        const next = new Set(s);
        next.delete(job.id);
        return next;
      });
    }
  };

  const term = search.trim().toLowerCase();
  const filtered = jobs.filter((j) => {
    if (selectedProjectId && j.project_id !== selectedProjectId) return false;
    if (!term) return true;
    return (
      j.question.toLowerCase().includes(term) ||
      j.project?.name?.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">Error al cargar encuestas</span>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar encuestas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select
            value={selectedProjectId ?? "all"}
            onValueChange={(v) => onSelectProject(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos los proyectos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNewProject}>
            Nuevo proyecto
          </Button>
          <Button
            className="gap-2"
            onClick={() => onNewJob(selectedProjectId)}
          >
            <Plus className="size-4" />
            Nueva codificación
          </Button>
        </div>
      </div>

      {selectedProjectId && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!!exporting}
            onClick={async () => {
              setExporting("project");
              try {
                await exportAllProjectResults(selectedProjectId);
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err));
              } finally {
                setExporting(null);
              }
            }}
          >
            <Download className="size-4" />
            {exporting === "project" ? "Exportando…" : "Exportar proyecto"}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay encuestas. Creá un proyecto y una codificación.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const isRunning = activeJobId === job.id;
            const prog =
              isRunning && progress?.jobId === job.id ? progress : null;

            return (
              <Card key={job.id}>
                <CardContent className="flex flex-col gap-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{job.question}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.project?.name} · {job.total_responses} respuestas
                      </p>
                    </div>
                    <Badge variant={statusVariant(job.status)}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                  </div>

                  {prog && (
                    <div className="space-y-1">
                      <Progress value={prog.percent} />
                      <p className="text-xs text-muted-foreground">
                        {prog.processed} / {prog.total} ({prog.percent}%)
                      </p>
                    </div>
                  )}

                  {!prog && job.progress_percentage > 0 && job.status !== "completed" && (
                    <Progress value={job.progress_percentage} />
                  )}

                  {job.error_message && (
                    <p className="text-xs text-destructive">{job.error_message}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!job.sample_training_completed ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1"
                        onClick={() => onOpenSamples(job.id)}
                      >
                        <FlaskConical className="size-3.5" />
                        Entrenar muestras
                      </Button>
                    ) : (
                      <>
                        {isRunning ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={handleCancel}
                          >
                            <Square className="size-3.5" />
                            Cancelar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1"
                            disabled={!!activeJobId || job.status === "completed"}
                            onClick={() => void handleRunJob(job)}
                          >
                            <Play className="size-3.5" />
                            {job.processed_responses > 0 ? "Continuar" : "Codificar"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => onOpenAnalysis(job.id)}
                          disabled={job.processed_responses === 0}
                        >
                          <BarChart3 className="size-3.5" />
                          Análisis
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={exporting === job.id || job.status !== "completed"}
                      onClick={async () => {
                        setExporting(job.id);
                        try {
                          await exportJobResults(job.id);
                        } catch (err) {
                          window.alert(
                            err instanceof Error ? err.message : String(err)
                          );
                        } finally {
                          setExporting(null);
                        }
                      }}
                    >
                      <Download className="size-3.5" />
                      Exportar
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deleting.has(job.id) || isRunning}
                      onClick={() => void handleDelete(job)}
                    >
                      {deleting.has(job.id) ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
