import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCategoriesByJob,
  replaceCategories,
} from "@/lib/codificacion/categories-repository";
import {
  getJob,
  listJobsByProject,
  updateJob,
} from "@/lib/codificacion/jobs-repository";
import { parseCategoryBookExcel } from "@/lib/codificacion/excel-upload";
import type { CodificacionJobWithProject } from "@/lib/codificacion/types";

interface LocalCategory {
  id: number;
  name: string;
  description?: string;
}

export interface EditJobProps {
  jobId: string;
  onBack: () => void;
  onSaved: () => void;
}

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

export function EditJob({ jobId, onBack, onSaved }: EditJobProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<CodificacionJobWithProject | null>(null);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [reuseJobId, setReuseJobId] = useState("");
  const [otherJobs, setOtherJobs] = useState<
    Array<{ id: string; question: string }>
  >([]);

  const bookInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await getJob(jobId);
      if (!j) throw new Error("Encuesta no encontrada");
      setJob(j);
      setQuestion(j.question);
      setDescription(j.description ?? "");

      const cats = await getCategoriesByJob(jobId);
      setCategories(
        cats
          .map((c) => ({
            id: c.category_id,
            name: c.name,
            description: c.description ?? undefined,
          }))
          .sort((a, b) => a.id - b.id)
      );

      const projectJobs = await listJobsByProject(j.project_id);
      setOtherJobs(
        projectJobs
          .filter((pj) => pj.id !== jobId)
          .map((pj) => ({ id: pj.id, question: pj.question }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      onBack();
    } finally {
      setLoading(false);
    }
  }, [jobId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    const newId =
      categories.length > 0 ? Math.max(...categories.map((c) => c.id)) + 1 : 1;
    setCategories([
      ...categories,
      { id: newId, name: newCategoryName.trim(), description: "" },
    ]);
    setNewCategoryName("");
  };

  const handleReuseCodebook = async (id: string) => {
    setReuseJobId(id);
    if (!id) return;
    try {
      const cats = await getCategoriesByJob(id);
      setCategories(
        cats
          .map((c) => ({
            id: c.category_id,
            name: c.name,
            description: c.description ?? undefined,
          }))
          .sort((a, b) => a.id - b.id)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    if (!question.trim()) {
      toast.warning("La pregunta no puede estar vacía.");
      return;
    }
    if (categories.length < 2) {
      toast.warning("Definí al menos 2 categorías en el libro de códigos.");
      return;
    }
    setSaving(true);
    try {
      await updateJob(jobId, {
        question: question.trim(),
        description: description.trim() || null,
      });
      await replaceCategories(
        jobId,
        categories.map((c) => ({
          name: c.name,
          category_id: c.id,
          description: c.description,
        }))
      );
      toast.success("Cambios guardados");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !job) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasResults = job.processed_responses > 0;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Editar Encuesta
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Modifica los detalles y categorías de tu encuesta
            </p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar Cambios
        </Button>
      </div>

      {/* Información de la Encuesta */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Información de la Encuesta</CardTitle>
            <p className="text-sm text-muted-foreground">
              Detalles básicos y estado actual
            </p>
          </div>
          <Badge variant={job.status === "completed" ? "default" : "outline"}>
            {job.status === "completed" ? "Completado" : "Pendiente"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Pregunta de la Encuesta *</Label>
              <Input
                className="mt-2"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div>
              <Label>Descripción (Opcional)</Label>
              <Textarea
                className="mt-2"
                rows={3}
                placeholder="Información adicional sobre esta encuesta…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Building2 className="size-4" />
              {job.project?.name ?? "—"}
            </p>
            <p className="flex items-center gap-2">
              <Calendar className="size-4" />
              {formatDate(job.completed_at ?? job.created_at)}
              <span className="ml-2">
                Respuestas:{" "}
                <span className="font-medium text-foreground">
                  {job.total_responses}
                </span>
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Libro de Códigos */}
      <Card>
        <CardHeader>
          <CardTitle>Libro de Códigos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Define y edita las categorías para clasificar las respuestas
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {hasResults && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-muted-foreground">
                Esta encuesta ya tiene respuestas clasificadas. Si cambiás o
                eliminás categorías, los resultados de Análisis y la exportación
                pueden quedar inconsistentes hasta que vuelvas a codificar.
              </p>
            </div>
          )}

          {otherJobs.length > 0 && (
            <div>
              <Label>Reutilizar Libro de Códigos</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Copia las categorías desde otra encuesta de este proyecto.
              </p>
              <Select value={reuseJobId} onValueChange={handleReuseCodebook}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Seleccionar encuesta para reutilizar" />
                </SelectTrigger>
                <SelectContent>
                  {otherJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.question}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Cargar Libro de Códigos (Excel)</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Carga un archivo Excel con tus categorías predefinidas, o créalas
              manualmente abajo.
            </p>
            <input
              ref={bookInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const { categories: imported, errors } =
                    await parseCategoryBookExcel(file);
                  if (imported.length) setCategories(imported);
                  if (errors.length) {
                    toast.warning(
                      `Importado con advertencias: ${errors.slice(0, 3).join(" · ")}`
                    );
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err));
                }
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-2 gap-2"
              onClick={() => bookInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Cargar archivo
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Crear Categorías Manualmente</Label>
              {categories.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => setCategories([])}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar todas
                </Button>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Nueva categoría…"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
              <Button type="button" onClick={addCategory}>
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={`${cat.id}-${cat.name}`}
                  className="flex items-center gap-2 rounded border p-2"
                >
                  <Input
                    type="number"
                    className="w-20"
                    value={cat.id}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n) && n > 0) {
                        setCategories((prev) =>
                          prev.map((c) =>
                            c.id === cat.id ? { ...c, id: n } : c
                          )
                        );
                      }
                    }}
                  />
                  <Input
                    className="flex-1"
                    value={cat.name}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) =>
                          c.id === cat.id ? { ...c, name: e.target.value } : c
                        )
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCategories((prev) =>
                        prev.filter((c) => c.id !== cat.id)
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <p className="mb-2 text-sm font-medium">
                Vista previa del libro de códigos:
              </p>
              <div className="space-y-1 text-sm">
                {[...categories]
                  .sort((a, b) => a.id - b.id)
                  .map((cat) => (
                    <div
                      key={`prev-${cat.id}`}
                      className="flex items-center justify-between text-blue-700 dark:text-blue-300"
                    >
                      <span>{cat.name}</span>
                      <span className="tabular-nums">{cat.id}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
