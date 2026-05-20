// Wizard de creación de cuestionarios.
//
// Tiene dos pasos:
//   1. metadata  → nombre + idioma + camino.
//   2. detail    → varía según el camino elegido:
//                  - blanco        → confirmar + crear vacío.
//                  - texto         → textarea + parser IA (Iteración 1).
//                  - docx          → file picker + mammoth + parser IA.
//                  - pdf           → file picker + pdfjs-dist + parser IA.
//                  - questionpro_api → input survey ID/URL + validate + import.
//
// Persistencia: el row de `questionnaires` se inserta acá (no en el editor)
// → el editor siempre opera sobre un id real. Cuando el camino requiere
// dependencias del sistema (OpenAI / QuestionPro), si la key no está cargada
// se muestra el error con shortcut a Ajustes — mismo patrón que Limpiador.

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Cloud,
  FilePlus2,
  FileText,
  FileType2,
  Loader2,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MissingOpenaiApiKeyError,
  parseDocxToQuestionnaire,
  parsePdfToQuestionnaire,
  parseTextToQuestionnaire,
  ParseError,
} from "@/lib/cuestionario/parser";
import {
  fetchQuestionnaireFromQp,
  MissingQuestionproApiKeyError,
} from "@/lib/cuestionario/qp-import";
import { createQuestionnaire } from "@/lib/cuestionario/questionnaire-repository";
import {
  emptyQuestionnaire,
  type Questionnaire,
  type QuestionnaireOrigin,
} from "@/lib/cuestionario/types";
import { MissingSupabaseSettingsError } from "@/lib/cuestionario/supabase-client";
import { extractQuestionProSurveyId, validateSurvey } from "@/lib/questionpro";
import { getQuestionproApiKey, getQuestionproUserId } from "@/lib/settings";
import { SurveyPicker } from "@/components/SurveyPicker";
import { logActivity } from "@/lib/activity";

type Camino = "blanco" | "texto" | "docx" | "pdf" | "questionpro_api";

export interface NewQuestionnaireProps {
  onCancel: () => void;
  onCreated: (id: string) => void;
  onOpenSettings?: () => void;
}

export function NewQuestionnaire({
  onCancel,
  onCreated,
  onOpenSettings,
}: NewQuestionnaireProps) {
  // Step 1: metadata.
  const [nombre, setNombre] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [pais, setPais] = useState("");
  const [camino, setCamino] = useState<Camino | null>(null);

  // Inputs por camino (todos opcionales — sólo se usan en el camino activo).
  const [rawText, setRawText] = useState("");
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Estado del camino api QP.
  const [surveyInput, setSurveyInput] = useState("");
  const [qpKeyLoading, setQpKeyLoading] = useState(false);
  const [qpKey, setQpKey] = useState<string | null>(null);
  const [qpUserId, setQpUserId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [surveyValid, setSurveyValid] = useState<{ id: string; name: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Si el error señala una key faltante, mostramos un shortcut a Ajustes. */
  const [missingKey, setMissingKey] = useState<"openai" | "questionpro" | null>(
    null
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  const nombreTrimmed = nombre.trim();
  const canPickCamino = nombreTrimmed.length > 0;

  // Al entrar al camino QP, cargamos la API key del store (igual que el
  // Limpiador en NewProject).
  useEffect(() => {
    if (camino !== "questionpro_api") return;
    let cancelled = false;
    setQpKeyLoading(true);
    setSurveyValid(null);
    Promise.all([getQuestionproApiKey(), getQuestionproUserId()]).then(
      ([k, uid]) => {
        if (cancelled) return;
        setQpKey(k);
        setQpUserId(uid);
        setQpKeyLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [camino]);

  const resetSubmitState = () => {
    setError(null);
    setMissingKey(null);
    setWarnings([]);
  };

  // ---------- Submit handlers por camino ----------

  async function handleCreateBlank() {
    if (!nombreTrimmed) return;
    setSubmitting(true);
    resetSubmitState();
    try {
      const empty = emptyQuestionnaire({
        titulo: nombreTrimmed,
        idioma: idioma || "es",
        pais: pais.trim() || undefined,
      });
      const row = await createQuestionnaire({
        nombre: nombreTrimmed,
        origen: "blanco",
        questionnaire_json: empty,
      });
      onCreated(row.id);
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateFromText() {
    if (!nombreTrimmed) return;
    const text = rawText.trim();
    if (!text) {
      setError("Pegá el texto del cuestionario antes de continuar.");
      return;
    }
    await runParseAndPersist({
      origen: "texto",
      archivo_nombre: null,
      doParse: () =>
        parseTextToQuestionnaire(text, {
          hintTitulo: nombreTrimmed,
          hintIdioma: idioma || "es",
          hintPais: pais.trim() || undefined,
        }),
    });
  }

  async function handleCreateFromDocx() {
    if (!nombreTrimmed || !docxFile) return;
    await runParseAndPersist({
      origen: "docx",
      archivo_nombre: docxFile.name,
      doParse: () =>
        parseDocxToQuestionnaire(docxFile, {
          hintTitulo: nombreTrimmed,
          hintIdioma: idioma || "es",
          hintPais: pais.trim() || undefined,
        }),
    });
  }

  async function handleCreateFromPdf() {
    if (!nombreTrimmed || !pdfFile) return;
    await runParseAndPersist({
      origen: "pdf",
      archivo_nombre: pdfFile.name,
      doParse: () =>
        parsePdfToQuestionnaire(pdfFile, {
          hintTitulo: nombreTrimmed,
          hintIdioma: idioma || "es",
          hintPais: pais.trim() || undefined,
        }),
    });
  }

  async function runParseAndPersist(args: {
    origen: QuestionnaireOrigin;
    archivo_nombre: string | null;
    doParse: () => Promise<Questionnaire>;
  }) {
    setSubmitting(true);
    resetSubmitState();
    try {
      const parsed = await args.doParse();
      const row = await createQuestionnaire({
        nombre: nombreTrimmed,
        origen: args.origen,
        archivo_nombre: args.archivo_nombre,
        questionnaire_json: parsed,
      });
      onCreated(row.id);
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleValidateSurvey() {
    if (!qpKey) {
      setError("Falta la API key de QuestionPro en Ajustes.");
      setMissingKey("questionpro");
      return;
    }
    const sid = extractQuestionProSurveyId(surveyInput);
    if (!sid) {
      setError("Ingresá un link o ID de encuesta válido.");
      return;
    }
    setValidating(true);
    resetSubmitState();
    setSurveyValid(null);
    try {
      // Confirmamos el nombre primero — el import real se dispara recién al
      // tocar "Importar y crear", reusando el mismo helper de QP.
      const info = await validateSurvey(sid, qpKey);
      setSurveyValid({ id: info.id, name: info.name });
    } catch (err) {
      handleError(err);
    } finally {
      setValidating(false);
    }
  }

  async function handleCreateFromQp() {
    if (!nombreTrimmed || !surveyValid || !qpKey) return;
    setSubmitting(true);
    resetSubmitState();
    try {
      const result = await fetchQuestionnaireFromQp(surveyValid.id, qpKey, {
        titulo: nombreTrimmed,
        idioma: idioma || "es",
        pais: pais.trim() || undefined,
      });
      const row = await createQuestionnaire({
        nombre: nombreTrimmed,
        origen: "questionpro_api",
        qp_survey_id: result.surveyId,
        questionnaire_json: result.questionnaire,
      });
      if (result.warnings.length > 0) {
        // Mostrar warnings antes de pasar al editor: damos un beat para que
        // el usuario los lea, luego habilitamos un botón "Abrir editor".
        setWarnings(result.warnings);
        // Guardamos el id pendiente para abrir cuando el usuario confirme.
        pendingOpenIdRef.current = row.id;
      } else {
        void logActivity({
          type: "cuestionario_created",
          title: `Cuestionario importado: ${nombreTrimmed}`,
          body: `QuestionPro · ${surveyValid.name}`,
          toolId: "cuestionario",
          viewId: "cuestionario",
          payload: { questionnaireId: row.id },
        });
        onCreated(row.id);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Ref para diferir la apertura del editor mientras el usuario lee warnings
  // del import QP. Si no hay warnings, navegamos directo (ver arriba).
  const pendingOpenIdRef = useRef<string | null>(null);

  function handleError(err: unknown) {
    if (err instanceof MissingOpenaiApiKeyError) {
      setMissingKey("openai");
      setError(err.message);
      return;
    }
    if (err instanceof MissingQuestionproApiKeyError) {
      setMissingKey("questionpro");
      setError(err.message);
      return;
    }
    if (err instanceof MissingSupabaseSettingsError) {
      setError(err.message);
      return;
    }
    if (err instanceof ParseError) {
      setError(`No se pudo parsear el cuestionario: ${err.message}`);
      return;
    }
    setError(err instanceof Error ? err.message : String(err));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
          className="gap-1"
        >
          <ArrowLeft className="size-4" />
          Volver
        </Button>
        <h2 className="text-lg font-semibold tracking-tight">
          Nuevo cuestionario
        </h2>
      </div>

      {/* Step 1: metadata común a todos los caminos. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos básicos</CardTitle>
          <CardDescription>
            Nombre del cuestionario y metadata. El idioma y el país se usan al
            parsear con IA y al publicar en QuestionPro.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="cuestionario-nombre">Nombre *</Label>
            <Input
              id="cuestionario-nombre"
              placeholder="Ej: Tracking Marca X - Ola Q3"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cuestionario-idioma">Idioma</Label>
            <Input
              id="cuestionario-idioma"
              placeholder="es"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cuestionario-pais">País (opcional)</Label>
            <Input
              id="cuestionario-pais"
              placeholder="Argentina"
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              disabled={submitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: elegir camino. */}
      {camino === null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">¿Cómo querés empezar?</CardTitle>
            <CardDescription>
              Cinco caminos: empezar en blanco, pegar texto, subir un Word o
              PDF para que la IA lo estructure, o importar directo desde la API
              de QuestionPro.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <CaminoCard
              icon={FilePlus2}
              title="Empezar en blanco"
              description="Arrancá con un cuestionario vacío y armalo en el editor."
              onClick={() => setCamino("blanco")}
              disabled={!canPickCamino || submitting}
            />
            <CaminoCard
              icon={ClipboardPaste}
              title="Pegar texto"
              description="Pegá el cuestionario crudo y la IA lo estructura."
              onClick={() => setCamino("texto")}
              disabled={!canPickCamino || submitting}
            />
            <CaminoCard
              icon={FileText}
              title="Subir Word"
              description=".docx → mammoth extrae el texto, la IA estructura."
              onClick={() => setCamino("docx")}
              disabled={!canPickCamino || submitting}
            />
            <CaminoCard
              icon={FileType2}
              title="Subir PDF"
              description=".pdf con texto seleccionable. Los escaneados no funcionan."
              onClick={() => setCamino("pdf")}
              disabled={!canPickCamino || submitting}
            />
            <CaminoCard
              icon={Cloud}
              title="Importar de QuestionPro"
              description="Trae la estructura directo de la API (sin parser IA)."
              onClick={() => setCamino("questionpro_api")}
              disabled={!canPickCamino || submitting}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 3 — camino "blanco". */}
      {camino === "blanco" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crear en blanco</CardTitle>
            <CardDescription>
              Se va a crear un cuestionario sin preguntas, listo para que las
              agregues en el editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setCamino(null)}
              disabled={submitting}
            >
              Cambiar camino
            </Button>
            <Button
              onClick={() => void handleCreateBlank()}
              disabled={!canPickCamino || submitting}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus2 className="size-4" />
              )}
              Crear cuestionario
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — camino "texto". */}
      {camino === "texto" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pegar texto del cuestionario</CardTitle>
            <CardDescription>
              Pegá el texto completo. La IA va a generar el JSON canónico con
              preguntas, opciones, flujos y secciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              placeholder="P1. ¿Con qué frecuencia consumís gaseosas?&#10;1. Todos los días&#10;..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={submitting}
              rows={14}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setCamino(null)}
                disabled={submitting}
              >
                Cambiar camino
              </Button>
              <Button
                onClick={() => void handleCreateFromText()}
                disabled={!canPickCamino || submitting}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {submitting ? "Parseando con IA…" : "Parsear con IA"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — camino "docx". */}
      {camino === "docx" && (
        <FileCaminoCard
          title="Subir archivo Word (.docx)"
          description="Se extrae el texto plano del documento y la IA lo estructura. El formato (negritas, listas, tablas) se pierde — sólo el texto importa."
          accept=".docx"
          file={docxFile}
          onPick={setDocxFile}
          onBack={() => {
            setCamino(null);
            setDocxFile(null);
          }}
          onConfirm={() => void handleCreateFromDocx()}
          submitting={submitting}
          confirmLabel="Parsear con IA"
        />
      )}

      {/* Step 3 — camino "pdf". */}
      {camino === "pdf" && (
        <FileCaminoCard
          title="Subir PDF (.pdf)"
          description="Se extrae el texto seleccionable del PDF y la IA lo estructura. PDFs escaneados (imágenes sin texto) no funcionan — copiá el contenido a la opción 'Pegar texto'."
          accept=".pdf"
          file={pdfFile}
          onPick={setPdfFile}
          onBack={() => {
            setCamino(null);
            setPdfFile(null);
          }}
          onConfirm={() => void handleCreateFromPdf()}
          submitting={submitting}
          confirmLabel="Parsear con IA"
        />
      )}

      {/* Step 3 — camino "questionpro_api". */}
      {camino === "questionpro_api" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Importar desde QuestionPro
            </CardTitle>
            <CardDescription>
              Pegá la URL de la encuesta o el Survey ID. Se valida contra la
              API, después confirmás para traer las preguntas. La API key se
              lee de Ajustes (la misma que usa el Limpiador).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {qpKeyLoading ? (
              <p className="text-sm text-muted-foreground">
                Cargando API key…
              </p>
            ) : !qpKey ? (
              <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p className="font-medium text-amber-300">
                  Falta la API key de QuestionPro
                </p>
                <p className="text-xs text-muted-foreground">
                  Cargala en Ajustes para poder importar.
                </p>
                {onOpenSettings && (
                  <div>
                    <Button size="sm" onClick={onOpenSettings}>
                      Ir a Ajustes
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <SurveyPicker
                  apiKey={qpKey}
                  userId={qpUserId}
                  value={surveyInput}
                  onChange={(v) => {
                    setSurveyInput(v);
                    setSurveyValid(null);
                  }}
                  onOpenSettings={onOpenSettings}
                  disabled={validating || submitting}
                />
                {!surveyValid ? (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void handleValidateSurvey()}
                      disabled={
                        !surveyInput.trim() || validating || submitting
                      }
                      variant="secondary"
                      className="gap-2"
                    >
                      {validating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Cloud className="size-4" />
                      )}
                      {validating ? "Validando…" : "Validar encuesta"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <span>
                      Encuesta encontrada:{" "}
                      <span className="font-medium">{surveyValid.name}</span>
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCamino(null);
                  setSurveyValid(null);
                  setSurveyInput("");
                }}
                disabled={submitting || validating}
              >
                Cambiar camino
              </Button>
              <Button
                onClick={() => void handleCreateFromQp()}
                disabled={!surveyValid || submitting || !qpKey}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Cloud className="size-4" />
                )}
                {submitting ? "Importando preguntas…" : "Importar y crear"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings del import QP — se muestran antes de saltar al editor para
          que el usuario los lea. */}
      {warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-300">
              Importado con advertencias
            </CardTitle>
            <CardDescription>
              Estas cosas no se mapearon 1:1 desde QuestionPro. Revisalas en
              el editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const id = pendingOpenIdRef.current;
                  if (id) onCreated(id);
                }}
              >
                Abrir editor
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error global del paso. */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              <span className="font-medium">No se pudo continuar</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {error}
            </pre>
            {missingKey && onOpenSettings && (
              <div>
                <Button size="sm" onClick={onOpenSettings}>
                  Ir a Ajustes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

interface CaminoCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}

function CaminoCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
}: CaminoCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </button>
  );
}

interface FileCaminoCardProps {
  title: string;
  description: string;
  accept: string;
  file: File | null;
  onPick: (file: File | null) => void;
  onBack: () => void;
  onConfirm: () => void;
  submitting: boolean;
  confirmLabel: string;
}

function FileCaminoCard({
  title,
  description,
  accept,
  file,
  onPick,
  onBack,
  onConfirm,
  submitting,
  confirmLabel,
}: FileCaminoCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            submitting && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
            disabled={submitting}
          />
          {file ? (
            <div className="flex flex-col items-center gap-1">
              <FileText className="size-8 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB · clic para cambiar
              </p>
            </div>
          ) : (
            <>
              <UploadIcon
                className={cn(
                  "size-10",
                  dragActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {dragActive
                    ? "Soltá el archivo acá"
                    : "Arrastrá un archivo o hacé clic"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Formato esperado: {accept}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onBack} disabled={submitting}>
            Cambiar camino
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!file || submitting}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {submitting ? "Parseando con IA…" : confirmLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
