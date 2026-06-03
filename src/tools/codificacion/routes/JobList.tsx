import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportAllProjectResults, exportJobResults } from "@/lib/codificacion/export";
import { deleteJob, listJobsWithProjects } from "@/lib/codificacion/jobs-repository";
import { listProjects } from "@/lib/codificacion/projects-repository";
import type {
  CodificacionJobWithProject,
  CodificacionProject,
} from "@/lib/codificacion/types";
import type { JobRunProgress } from "../CodificacionView";

export interface JobListProps {
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onNewProject: () => void;
  onNewJob: (projectId: string | null) => void;
  onOpenSamples: (jobId: string) => void;
  onOpenAnalysis: (jobId: string) => void;
  onOpenEdit: (jobId: string) => void;
  onRefreshKeys: () => void;
  // Corrida del job (hoisteada en CodificacionView).
  activeJobId: string | null;
  progress: JobRunProgress | null;
  onRunJob: (job: CodificacionJobWithProject) => void;
  onCancelJob: () => void;
  reloadToken: number;
}

type StatusKey =
  | "completed"
  | "processing"
  | "ready"
  | "needs_training"
  | "error";

function statusKey(job: CodificacionJobWithProject): StatusKey {
  if (!job.sample_training_completed) return "needs_training";
  if (job.status === "completed") return "completed";
  if (job.status === "processing") return "processing";
  if (job.status === "error") return "error";
  return "ready";
}

const STATUS_META: Record<
  StatusKey,
  { label: string; icon: typeof CheckCircle2; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  completed: { label: "Completado", icon: CheckCircle2, variant: "default" },
  processing: { label: "Procesando", icon: Loader2, variant: "secondary" },
  ready: { label: "Listo para ejecutar", icon: Clock, variant: "outline" },
  needs_training: { label: "Entrenar muestras", icon: Target, variant: "outline" },
  error: { label: "Error", icon: AlertCircle, variant: "destructive" },
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export function JobList({
  selectedProjectId,
  onSelectProject,
  onNewProject,
  onNewJob,
  onOpenSamples,
  onOpenAnalysis,
  onOpenEdit,
  activeJobId,
  progress,
  onRunJob,
  onCancelJob,
  reloadToken,
}: JobListProps) {
  const [jobs, setJobs] = useState<CodificacionJobWithProject[]>([]);
  const [projects, setProjects] = useState<CodificacionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] =
    useState<CodificacionJobWithProject | null>(null);

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
  }, [load, reloadToken]);

  const handleExportJob = async (job: CodificacionJobWithProject) => {
    setExporting(job.id);
    try {
      await exportJobResults(job.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  };

  const confirmDelete = async () => {
    const job = jobToDelete;
    if (!job) return;
    if (activeJobId === job.id) {
      toast.warning("Cancelá la codificación en curso antes de eliminar.");
      setJobToDelete(null);
      return;
    }
    setJobToDelete(null);
    setDeleting((s) => new Set(s).add(job.id));
    try {
      await deleteJob(job.id);
      await load();
      toast.success("Encuesta eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting((s) => {
        const next = new Set(s);
        next.delete(job.id);
        return next;
      });
    }
  };

  // Stats y lista respetan el filtro de proyecto.
  const projectScoped = jobs.filter(
    (j) => !selectedProjectId || j.project_id === selectedProjectId
  );

  const stats = {
    total: projectScoped.length,
    completed: projectScoped.filter((j) => j.status === "completed").length,
    pending: projectScoped.filter(
      (j) => j.status !== "completed" && j.sample_training_completed
    ).length,
    needsTraining: projectScoped.filter((j) => !j.sample_training_completed)
      .length,
  };

  const term = search.trim().toLowerCase();
  const filtered = projectScoped.filter((j) => {
    if (statusFilter !== "all" && statusKey(j) !== statusFilter) return false;
    if (!term) return true;
    return (
      j.question.toLowerCase().includes(term) ||
      j.project?.name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Codificación de Encuestas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra y monitorea tus encuestas de clasificación automática de
            respuestas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Proyecto:
          </span>
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
          <Button variant="outline" className="gap-2" onClick={onNewProject}>
            <Plus className="size-4" />
            Crear Proyecto
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Encuestas" value={stats.total} />
        <StatCard
          label="Completadas"
          value={stats.completed}
          className="text-green-600"
        />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          className="text-amber-600"
        />
        <StatCard
          label="Necesitan Entrenamiento"
          value={stats.needsTraining}
          className="text-amber-600"
        />
      </div>

      {/* Búsqueda + filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar encuestas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="ready">Listo para ejecutar</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="needs_training">Entrenar muestras</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            {selectedProjectId && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={!!exporting}
                onClick={async () => {
                  setExporting("project");
                  try {
                    await exportAllProjectResults(selectedProjectId);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : String(err)
                    );
                  } finally {
                    setExporting(null);
                  }
                }}
              >
                <Download className="size-4" />
                {exporting === "project" ? "Exportando…" : "Exportar proyecto"}
              </Button>
            )}
            <Button
              className="gap-2"
              onClick={() => onNewJob(selectedProjectId)}
            >
              <Plus className="size-4" />
              Crear Encuesta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay encuestas. Creá un proyecto y una codificación.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              isRunning={activeJobId === job.id}
              progress={
                activeJobId === job.id && progress?.jobId === job.id
                  ? progress
                  : null
              }
              busy={!!activeJobId && activeJobId !== job.id}
              exporting={exporting === job.id}
              deleting={deleting.has(job.id)}
              onRun={() => onRunJob(job)}
              onCancel={onCancelJob}
              onAnalysis={() => onOpenAnalysis(job.id)}
              onSamples={() => onOpenSamples(job.id)}
              onEdit={() => onOpenEdit(job.id)}
              onExport={() => void handleExportJob(job)}
              onDelete={() => setJobToDelete(job)}
            />
          ))}
        </div>
      )}

      {/* Confirmación de borrado */}
      <Dialog
        open={!!jobToDelete}
        onOpenChange={(open) => !open && setJobToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar encuesta</DialogTitle>
            <DialogDescription>
              ¿Seguro que querés eliminar{" "}
              <span className="font-medium text-foreground">
                “{jobToDelete?.question}”
              </span>
              ? Se borran sus respuestas, categorías y clasificaciones. Esta
              acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
        <span className={`text-2xl font-bold ${className ?? ""}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

interface JobRowProps {
  job: CodificacionJobWithProject;
  isRunning: boolean;
  progress: JobRunProgress | null;
  busy: boolean;
  exporting: boolean;
  deleting: boolean;
  onRun: () => void;
  onCancel: () => void;
  onAnalysis: () => void;
  onSamples: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function JobRow({
  job,
  isRunning,
  progress,
  busy,
  exporting,
  deleting,
  onRun,
  onCancel,
  onAnalysis,
  onSamples,
  onEdit,
  onExport,
  onDelete,
}: JobRowProps) {
  const key = statusKey(job);
  const meta = STATUS_META[key];
  const StatusIcon = meta.icon;
  const hasResults = job.processed_responses > 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Izquierda: título + estado + metadata */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{job.question}</p>
              <Badge variant={meta.variant} className="gap-1">
                <StatusIcon
                  className={`size-3 ${key === "processing" ? "animate-spin" : ""}`}
                />
                {meta.label}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" />
                {job.project?.name ?? "—"}
              </span>
              {job.excel_filename && (
                <span className="flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {job.excel_filename}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {formatDate(job.completed_at ?? job.created_at)}
              </span>
              <span>Respuestas: {job.total_responses}</span>
            </div>
          </div>

          {/* Derecha: acciones según estado */}
          <div className="flex shrink-0 items-center gap-2">
            {key === "needs_training" ? (
              <Button size="sm" className="gap-1" onClick={onSamples}>
                <Target className="size-3.5" />
                Entrenar Muestras
              </Button>
            ) : isRunning ? (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                onClick={onCancel}
              >
                <Square className="size-3.5" />
                Cancelar
              </Button>
            ) : key === "completed" ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={exporting}
                onClick={onExport}
              >
                <Download className="size-3.5" />
                {exporting ? "Descargando…" : "Descargar"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1"
                disabled={busy}
                onClick={onRun}
              >
                <Play className="size-3.5" />
                {hasResults ? "Continuar" : "Ejecutar"}
              </Button>
            )}

            {hasResults && !isRunning && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={onAnalysis}
              >
                <BarChart3 className="size-3.5" />
                Análisis
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={onEdit}
            >
              Ver detalles
              <ChevronRight className="size-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" disabled={deleting}>
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MoreVertical className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {key === "needs_training" && (
                  <DropdownMenuItem onClick={onSamples}>
                    <FlaskConical className="size-4" />
                    Entrenar muestras
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onEdit}>
                  <FileText className="size-4" />
                  Ver detalles
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isRunning}
                  onClick={onDelete}
                >
                  <Trash2 className="size-4" />
                  Eliminar encuesta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Progreso / errores */}
        {progress && (
          <div className="space-y-1">
            <Progress value={progress.percent} />
            <p className="text-xs text-muted-foreground">
              {progress.processed} / {progress.total} ({progress.percent}%)
            </p>
          </div>
        )}

        {!progress &&
          job.progress_percentage > 0 &&
          job.status !== "completed" && (
            <Progress value={job.progress_percentage} />
          )}

        {job.error_message && !isRunning && (
          <p className="text-xs text-destructive">{job.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}
