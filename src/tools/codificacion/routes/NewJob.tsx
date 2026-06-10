import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { listProjects } from "@/lib/codificacion/projects-repository";
import { createJob, listJobsByProject } from "@/lib/codificacion/jobs-repository";
import { createCategories, getCategoriesByJob } from "@/lib/codificacion/categories-repository";
import { createResponsesFromExcel } from "@/lib/codificacion/responses-repository";
import {
  finalizeQuestionProSelection,
  parseCategoryBookExcel,
  parseResponsesExcel,
  type PendingQuestionProSelection,
} from "@/lib/codificacion/excel-upload";
import type {
  CodificacionProject,
  ExcelUploadData,
  SurveyPlatform,
} from "@/lib/codificacion/types";

interface LocalCategory {
  id: number;
  name: string;
  description?: string;
}

export interface NewJobProps {
  initialProjectId: string | null;
  onCancel: () => void;
  onCreated: (jobId: string) => void;
}

export function NewJob({ initialProjectId, onCancel, onCreated }: NewJobProps) {
  const [step, setStep] = useState<"form" | "categories" | "review">("form");
  const [projects, setProjects] = useState<CodificacionProject[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [languageCode, setLanguageCode] = useState("es");
  const [regionHint, setRegionHint] = useState("");
  const [platform, setPlatform] = useState<SurveyPlatform>("qualtrics");
  const [excelData, setExcelData] = useState<ExcelUploadData | null>(null);
  const [pendingQP, setPendingQP] =
    useState<PendingQuestionProSelection | null>(null);
  const [selectedResponseCol, setSelectedResponseCol] = useState<number | null>(
    null
  );
  const [columnSearch, setColumnSearch] = useState("");
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [reuseJobId, setReuseJobId] = useState("");
  const [projectJobs, setProjectJobs] = useState<Array<{ id: string; question: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const bookInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void listJobsByProject(projectId).then((jobs) =>
      setProjectJobs(jobs.map((j) => ({ id: j.id, question: j.question })))
    );
  }, [projectId, step]);

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

  const handleReuseCodebook = async (jobId: string) => {
    setReuseJobId(jobId);
    if (!jobId) return;
    try {
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
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Limpia el estado del Excel (al cambiar de plataforma o quitar el archivo).
  const resetExcel = () => {
    setExcelData(null);
    setPendingQP(null);
    setSelectedResponseCol(null);
    setColumnSearch("");
  };

  const handlePlatformChange = (value: string) => {
    setPlatform(value as SurveyPlatform);
    resetExcel();
  };

  const handleFile = async (file: File) => {
    try {
      const result = await parseResponsesExcel(file, platform);
      if (result.kind === "ready") {
        setExcelData(result.data);
        setPendingQP(null);
      } else {
        // QuestionPro: el usuario debe elegir la columna de respuesta.
        setPendingQP(result.pending);
        setExcelData(null);
        setSelectedResponseCol(null);
        setColumnSearch("");
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  const confirmResponseColumn = () => {
    if (!pendingQP || selectedResponseCol === null) return;
    setExcelData(finalizeQuestionProSelection(pendingQP, selectedResponseCol));
    setPendingQP(null);
  };

  const handleSubmit = async () => {
    if (!projectId || !question.trim() || !excelData || categories.length < 2) {
      window.alert("Completá proyecto, pregunta, Excel y al menos 2 categorías");
      return;
    }
    setSubmitting(true);
    try {
      const job = await createJob({
        project_id: projectId,
        question,
        description: description.trim() || undefined,
        language_code: languageCode,
        region_hint: regionHint.trim() || undefined,
        excel_filename: excelData.filename,
        total_responses: excelData.rows,
      });

      await createCategories(
        job.id,
        categories.map((c) => ({
          name: c.name,
          category_id: c.id,
          description: c.description,
        }))
      );

      const idCol = excelData.idColumnIndex;
      const respCol = excelData.responseColumnIndex;
      const processed = excelData.rawData.slice(1).map((row, index) => ({
        id: String(row[idCol] ?? `Row_${index + 1}`),
        response: row[respCol] ? String(row[respCol]).trim() : "",
      }));
      await createResponsesFromExcel(job.id, processed);
      onCreated(job.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" className="gap-2" onClick={onCancel}>
          <ArrowLeft className="size-4" />
          Volver a Encuestas
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Nueva Codificación
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un nuevo trabajo de clasificación automática de respuestas
          </p>
        </div>
      </div>

      <Stepper current={step} />

      {step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle>Datos y Excel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Proyecto *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Idioma</Label>
                <Select value={languageCode} onValueChange={setLanguageCode}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="pt">Portugués</SelectItem>
                    <SelectItem value="en">Inglés</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Región (opcional)</Label>
                <Input
                  className="mt-2"
                  value={regionHint}
                  onChange={(e) => setRegionHint(e.target.value)}
                  placeholder="MX, CL, AR…"
                />
              </div>
            </div>

            <div>
              <Label>Pregunta de la encuesta *</Label>
              <Input
                className="mt-2"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                className="mt-2"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <Label>Plataforma de origen</Label>
              <Select value={platform} onValueChange={handlePlatformChange}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualtrics">Qualtrics</SelectItem>
                  <SelectItem value="questionpro">QuestionPro</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {platform === "questionpro"
                  ? "Subí el export crudo de QuestionPro. Vas a poder elegir la columna de respuesta."
                  : "El archivo debe tener 2 columnas: ID de respuesta y texto de respuesta."}
              </p>
            </div>

            <div>
              <Label>Excel de respuestas *</Label>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleFile(file);
                  e.target.value = "";
                }}
              />
              {excelData ? (
                <div className="mt-2 flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="size-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">{excelData.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {excelData.rows} filas · respuesta:{" "}
                        {String(
                          excelData.rawData[0]?.[excelData.responseColumnIndex] ??
                            `Columna ${excelData.responseColumnIndex + 1}`
                        )}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={resetExcel}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : pendingQP ? (
                <ResponseColumnSelector
                  pending={pendingQP}
                  selected={selectedResponseCol}
                  search={columnSearch}
                  onSearch={setColumnSearch}
                  onSelect={setSelectedResponseCol}
                  onConfirm={confirmResponseColumn}
                  onCancel={resetExcel}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 gap-2"
                  onClick={() => excelInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Subir archivo
                </Button>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                disabled={!projectId || !question.trim() || !excelData}
                onClick={() => setStep("categories")}
              >
                Continuar al libro de códigos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "categories" && (
        <Card>
          <CardHeader>
            <CardTitle>Libro de códigos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectJobs.length > 0 && (
              <div>
                <Label>Reutilizar de otra encuesta</Label>
                <Select value={reuseJobId} onValueChange={handleReuseCodebook}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectJobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.question}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Cargar libro desde Excel</Label>
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
                    if (imported.length) {
                      setCategories(imported);
                    }
                    if (errors.length) {
                      window.alert(
                        `Importado con advertencias:\n${errors.slice(0, 5).join("\n")}`
                      );
                    }
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : String(err));
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
                Cargar libro
              </Button>
            </div>

            <div className="flex gap-2">
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

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.id}
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
                      setCategories((prev) => prev.filter((c) => c.id !== cat.id))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("form")}>
                Atrás
              </Button>
              <Button
                disabled={categories.length < 2}
                onClick={() => setStep("review")}
              >
                Revisar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Revisar y crear</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              <strong>Pregunta:</strong> {question}
            </p>
            <p>
              <strong>Respuestas:</strong> {excelData?.rows} filas (
              {excelData?.filename})
            </p>
            <p>
              <strong>Categorías:</strong> {categories.length}
            </p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("categories")}>
                Atrás
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? "Creando…" : "Crear y entrenar muestras"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ResponseColumnSelectorProps {
  pending: PendingQuestionProSelection;
  selected: number | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Selector de la columna de respuesta para archivos de QuestionPro: lista las
 * columnas (con conteo de respuestas y preview) y deja buscar y elegir cuál
 * es la pregunta abierta a clasificar.
 */
function ResponseColumnSelector({
  pending,
  selected,
  search,
  onSearch,
  onSelect,
  onConfirm,
  onCancel,
}: ResponseColumnSelectorProps) {
  const filtered = pending.columns.filter((col) =>
    col.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-2 space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-green-600" />
          <div>
            <p className="text-sm font-medium">{pending.filename}</p>
            <p className="text-xs text-muted-foreground">
              {pending.totalRows} filas · {pending.columns.length} columnas ·
              ID: {pending.idColumnName}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Elegí la columna con las respuestas abiertas a clasificar.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar columnas…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No se encontraron columnas para “{search}”
          </p>
        ) : (
          filtered.map((col) => {
            const isSelected = selected === col.index;
            return (
              <button
                key={col.index}
                type="button"
                onClick={() => onSelect(col.index)}
                className={cn(
                  "w-full rounded border p-2 text-left text-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-3.5 shrink-0 rounded-full border-2",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}
                  />
                  <span className="flex-1 truncate font-medium">{col.name}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {col.nonEmptyCount} resp.
                  </span>
                </div>
                {col.preview.length > 0 && (
                  <div className="ml-6 mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {col.preview.map((p, i) => (
                      <div key={i} className="truncate">
                        • {p}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={onConfirm}
        disabled={selected === null}
      >
        Confirmar columna seleccionada
      </Button>
    </div>
  );
}

const STEPS: Array<{ key: "form" | "categories" | "review"; label: string }> = [
  { key: "form", label: "Datos y Excel" },
  { key: "categories", label: "Libro de Códigos" },
  { key: "review", label: "Configurar y Crear" },
];

function Stepper({ current }: { current: "form" | "categories" | "review" }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-primary/80 text-primary-foreground",
                  !active && !done && "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-3 h-px w-12 sm:w-20",
                  i < currentIndex ? "bg-primary/60" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
