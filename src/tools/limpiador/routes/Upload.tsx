// Pantalla Upload del Limpiador (etapas 2.B + 2.C combinadas).
//
// Flujo:
//   1. Carga el proyecto (necesario para saber el `source` y, si QP,
//      `qp_survey_id`).
//   2. El usuario elige un archivo .xlsx/.xls.
//   3. Parseamos según el `source` (parseQualtricsSheet / parseQuestionProSheet).
//   4. Si QP: llamamos a la API y enriquecemos el schema. Mostramos resumen
//      de match (X matched / Y unmatched) y un mapping manual para asignar
//      preguntas QP a columnas que no matchearon automáticamente.
//   5. El usuario aprueba → creamos `cleaning_versions` y cargamos las filas
//      en batches con barra de progreso.
//   6. Vuelve al detalle del proyecto.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload as UploadIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { parseExcel, type ParsedExcel } from "@/lib/cleaning/excel-parser";
import { enrichSchemaWithQuestionPro } from "@/lib/cleaning/enrich-schema";
import { getProject } from "@/lib/cleaning/projects-repository";
import {
  createVersion,
  insertRows,
} from "@/lib/cleaning/versions-repository";
import type {
  CleaningProject,
  SchemaColumn,
} from "@/lib/cleaning/types";
import { getQuestionproApiKey } from "@/lib/settings";
import type { QPQuestion } from "@/lib/questionpro";

export interface UploadProps {
  projectId: string;
  onCancel: () => void;
  /** Llamado tras crear la versión exitosamente, con el versionId. */
  onUploaded: (versionId: string) => void;
  onOpenSettings?: () => void;
}

type Phase =
  | { kind: "loading-project" }
  | { kind: "ready" }
  | { kind: "parsing" }
  | { kind: "preview" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string };

export function Upload({
  projectId,
  onCancel,
  onUploaded,
  onOpenSettings,
}: UploadProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading-project" });
  const [parsed, setParsed] = useState<ParsedExcel | null>(null);
  const [qpCatalog, setQpCatalog] = useState<QPQuestion[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cargar el proyecto.
  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading-project" });
    getProject(projectId)
      .then((p) => {
        if (!cancelled) {
          setProject(p);
          setPhase({ kind: "ready" });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message:
              err instanceof Error
                ? err.message
                : "No se pudo cargar el proyecto.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Procesa el archivo elegido: parse + (si QP) enrich.
  const handleFile = useCallback(
    async (file: File) => {
      if (!project) return;
      setPhase({ kind: "parsing" });
      setParsed(null);
      setQpCatalog([]);

      try {
        const parsedExcel = await parseExcel(file, project.source);

        if (project.source === "questionpro") {
          if (!project.qp_survey_id) {
            throw new Error(
              "El proyecto está configurado como QuestionPro pero no tiene " +
                "Survey ID. Borrá el proyecto y creá uno nuevo."
            );
          }
          const apiKey = await getQuestionproApiKey();
          if (!apiKey) {
            throw new Error(
              "Falta la API Key de QuestionPro en Ajustes. Cargala antes de " +
                "subir el Excel para poder cruzar las preguntas con la API."
            );
          }
          const enriched = await enrichSchemaWithQuestionPro({
            surveyId: project.qp_survey_id,
            apiKey,
            schema: parsedExcel.schema,
          });
          setParsed({ ...parsedExcel, schema: enriched.schema });
          setQpCatalog(enriched.qpQuestions);
        } else {
          setParsed(parsedExcel);
        }

        setPhase({ kind: "preview" });
      } catch (err) {
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Error al procesar el archivo.",
        });
      }
    },
    [project]
  );

  const handleAssignQuestion = useCallback(
    (columnId: string, questionIdValue: string) => {
      setParsed((prev) => {
        if (!prev) return prev;
        const nextCols: SchemaColumn[] = prev.schema.columns.map((c) => {
          if (c.id !== columnId) return c;
          if (questionIdValue === "__none__") {
            return {
              ...c,
              qp_question_id: undefined,
              qp_question_type: undefined,
              qp_options: undefined,
            };
          }
          const q = qpCatalog.find(
            (x) => x.questionID === Number(questionIdValue)
          );
          if (!q) return c;
          return {
            ...c,
            qp_question_id: q.questionID,
            qp_question_type: q.questionType,
            qp_options: q.options,
          };
        });
        return { ...prev, schema: { columns: nextCols } };
      });
    },
    [qpCatalog]
  );

  const handleUpload = useCallback(async () => {
    if (!parsed) return;
    setPhase({ kind: "uploading", progress: 5 });

    try {
      const version = await createVersion({
        projectId,
        filename: parsed.filename,
        totalRows: parsed.totalRows,
        schema: parsed.schema,
      });

      setPhase({ kind: "uploading", progress: 15 });

      await insertRows({
        versionId: version.id,
        rows: parsed.rows,
        onProgress: ({ inserted, total }) => {
          // 15..100 cubre la inserción de filas.
          const pct = 15 + Math.round((inserted / total) * 85);
          setPhase({ kind: "uploading", progress: pct });
        },
      });

      setPhase({ kind: "uploading", progress: 100 });
      void import("@/lib/activity").then(({ logActivity }) =>
        logActivity({
          type: "limpiador_upload",
          title: "Datos cargados en Limpiador",
          body: `${parsed.filename} · ${parsed.totalRows} filas`,
          toolId: "limpiador",
          viewId: "limpiador",
          payload: { projectId, versionId: version.id },
        })
      );
      onUploaded(version.id);
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error al subir el archivo.",
      });
    }
  }, [parsed, projectId, onUploaded]);

  const reset = () => {
    setParsed(null);
    setQpCatalog([]);
    setPhase({ kind: "ready" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Render -------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al proyecto
        </Button>
      </div>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <UploadIcon className="size-5" />
          Subir nueva versión
        </h2>
        {project && (
          <p className="text-sm text-muted-foreground">
            Proyecto: {project.name} ·{" "}
            <span className="font-medium">
              {project.source === "questionpro" ? "QuestionPro" : "Qualtrics"}
            </span>
          </p>
        )}
      </div>

      {phase.kind === "loading-project" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando proyecto…
        </div>
      )}

      {phase.kind === "error" && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="font-medium">No se pudo procesar</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {phase.message}
            </pre>
            <div className="flex gap-2">
              <Button size="sm" onClick={reset}>
                Reintentar
              </Button>
              {phase.message.toLowerCase().includes("api key") &&
                onOpenSettings && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onOpenSettings}
                  >
                    Ir a Ajustes
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {(phase.kind === "ready" || phase.kind === "parsing") && project && (
        <FilePicker
          source={project.source}
          parsing={phase.kind === "parsing"}
          fileInputRef={fileInputRef}
          onPick={(f) => void handleFile(f)}
        />
      )}

      {(phase.kind === "preview" || phase.kind === "uploading") && parsed && (
        <PreviewCard
          parsed={parsed}
          qpCatalog={qpCatalog}
          isQuestionPro={project?.source === "questionpro"}
          uploading={phase.kind === "uploading"}
          uploadProgress={
            phase.kind === "uploading" ? phase.progress : 0
          }
          onAssignQuestion={handleAssignQuestion}
          onClear={reset}
          onUpload={() => void handleUpload()}
        />
      )}
    </div>
  );
}

// --- Subcomponentes ---------------------------------------------------------

interface FilePickerProps {
  source: CleaningProject["source"];
  parsing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
}

function FilePicker({ source, parsing, fileInputRef, onPick }: FilePickerProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            parsing && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
            disabled={parsing}
          />
          {parsing ? (
            <>
              <Loader2 className="size-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Procesando Excel
                {source === "questionpro" &&
                  " y cruzando preguntas con QuestionPro"}
                …
              </p>
            </>
          ) : (
            <>
              <UploadIcon
                className={cn(
                  "size-12",
                  dragActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <div className="flex flex-col gap-1">
                <p className="text-base font-medium">
                  {dragActive
                    ? "Soltá el archivo acá"
                    : "Subí tu archivo Excel"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Arrastrá un .xlsx o .xls, o hacé clic para elegir.
                </p>
              </div>

              <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">
                  Formato esperado (
                  {source === "questionpro" ? "QuestionPro" : "Qualtrics"}):
                </p>
                {source === "questionpro" ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>
                      Fila 1: encabezados (ID Respuesta, Fecha y Hora, … +
                      preguntas)
                    </li>
                    <li>Fila 2 en adelante: una fila por respondente</li>
                  </ul>
                ) : (
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Fila 1: IDs de columnas (ResponseId, Q1, Q2…)</li>
                    <li>Fila 2: texto de preguntas</li>
                    <li>Fila 3 en adelante: datos</li>
                  </ul>
                )}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
              >
                Seleccionar archivo
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface PreviewCardProps {
  parsed: ParsedExcel;
  qpCatalog: QPQuestion[];
  isQuestionPro: boolean;
  uploading: boolean;
  uploadProgress: number;
  onAssignQuestion: (columnId: string, questionIdValue: string) => void;
  onClear: () => void;
  onUpload: () => void;
}

function PreviewCard({
  parsed,
  qpCatalog,
  isQuestionPro,
  uploading,
  uploadProgress,
  onAssignQuestion,
  onClear,
  onUpload,
}: PreviewCardProps) {
  const questionCols = parsed.schema.columns.filter(
    (c) => !c.is_metadata && !c.id.startsWith("META_")
  );
  const matched = questionCols.filter((c) => c.qp_question_id != null).length;
  const unmatchedCols = questionCols.filter((c) => c.qp_question_id == null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 text-emerald-500" />
          Archivo listo para subir
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Info del archivo */}
        <div className="flex items-center justify-between rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium">{parsed.filename}</p>
              <p className="text-xs text-muted-foreground">
                {parsed.totalRows} filas · {parsed.schema.columns.length}{" "}
                columnas
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            disabled={uploading}
            aria-label="Quitar archivo"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Resumen QP + mapping manual */}
        {isQuestionPro && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
            <h4 className="text-sm font-medium">
              Cruce con la encuesta (QuestionPro)
            </h4>
            <ul className="ml-5 list-disc text-xs text-muted-foreground">
              <li>{questionCols.length} columnas de pregunta en el Excel</li>
              <li>{matched} vinculadas automáticamente por texto</li>
              <li>{unmatchedCols.length} sin coincidencia exacta</li>
            </ul>
            {unmatchedCols.length > 0 && qpCatalog.length > 0 && (
              <details className="group text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-2 py-1 font-medium text-foreground">
                  <span className="inline-block transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  Asignar pregunta manualmente
                </summary>
                <div className="mt-2 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                  {unmatchedCols.map((col) => (
                    <div
                      key={col.id}
                      className="grid gap-2 border-t border-border/60 pt-3 first:border-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center"
                    >
                      <p
                        className="line-clamp-3 text-xs"
                        title={col.question}
                      >
                        {col.question || col.id}
                      </p>
                      <Select
                        value={
                          col.qp_question_id != null
                            ? String(col.qp_question_id)
                            : "__none__"
                        }
                        onValueChange={(v) => onAssignQuestion(col.id, v)}
                        disabled={uploading}
                      >
                        <SelectTrigger className="h-auto min-h-9 text-left text-xs">
                          <SelectValue placeholder="Elegir pregunta…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="__none__">Sin asignar</SelectItem>
                          {qpCatalog.map((q) => (
                            <SelectItem
                              key={q.questionID}
                              value={String(q.questionID)}
                            >
                              <span className="line-clamp-2">
                                ({q.questionID}) {q.questionText}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Columnas detectadas (chips) */}
        <div>
          <h4 className="mb-2 text-sm font-medium">Columnas detectadas</h4>
          <div className="flex flex-wrap gap-1.5">
            {parsed.schema.columns.slice(0, 12).map((col) => (
              <span
                key={col.index}
                className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
                title={col.question}
              >
                {col.id}
              </span>
            ))}
            {parsed.schema.columns.length > 12 && (
              <span className="text-xs text-muted-foreground">
                +{parsed.schema.columns.length - 12} más
              </span>
            )}
          </div>
        </div>

        {/* Vista previa de datos */}
        <div>
          <h4 className="mb-2 text-sm font-medium">Vista previa</h4>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="border-b p-2 text-left font-medium text-muted-foreground">
                    #
                  </th>
                  {parsed.preview.headers.map((h) => (
                    <th
                      key={h}
                      className="border-b p-2 text-left font-mono font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.preview.sampleRows.map((row, i) => (
                  <tr key={i} className="even:bg-muted/20">
                    <td className="border-b p-2 text-muted-foreground">
                      {i + 1}
                    </td>
                    {parsed.preview.headers.map((h) => (
                      <td
                        key={h}
                        className="max-w-[200px] truncate border-b p-2"
                      >
                        {String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Progreso */}
        {uploading && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <span>Subiendo datos…</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} />
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClear} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            onClick={onUpload}
            disabled={uploading}
            className="gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <UploadIcon className="size-4" />
                Subir y guardar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
