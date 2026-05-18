// Pantalla "reporte de validación" del cuestionario.
//
// Muestra el último reporte persistido en `questionnaire_validations` y permite
// re-validar opcionalmente con IA. Para una corrida con IA, los 6 checks
// semánticos se ejecutan en serie y reportan progreso por categoría con un
// callback (no SSE — patrón Tauri).
//
// Filtros: el usuario puede ocultar issues por severidad o por categoría sin
// tocar lo persistido. Los contadores siempre reflejan TOTAL, no filtrado.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getLatestValidation,
  getQuestionnaire,
  updateQpPublishedInfo,
} from "@/lib/cuestionario/questionnaire-repository";
import {
  runValidation,
  type ValidationProgressEvent,
} from "@/lib/cuestionario/validation-job";
import {
  publishQuestionnaireToQp,
  PublishToQpError,
} from "@/lib/cuestionario/qp-publish";
import {
  getQuestionproApiKey,
  getQuestionproUserId,
} from "@/lib/settings";
import type {
  IssueCategory,
  IssueSeverity,
  QCIssue,
  QuestionnaireRow,
  QuestionnaireValidationReport,
} from "@/lib/cuestionario/types";

export interface ValidationReportProps {
  questionnaireId: string;
  onBack: () => void;
  /** Si se pasa, el modal "Publicar" muestra un shortcut a Ajustes cuando
   *  faltan las keys de QP. */
  onOpenSettings?: () => void;
}

/** Estado de la publicación en QP (Iteración 8). */
interface PublishState {
  step: "idle" | "publishing" | "done" | "error";
  progress?: { current: number; total: number };
  result?: {
    qp_survey_id: string;
    qp_survey_url: string;
    warnings: string[];
  };
  error?: string;
  errorAtIndex?: number;
  /** Datos parciales si falló a mitad (ya se creó la encuesta en QP). */
  partial?: {
    qp_survey_id: string;
    qp_survey_url: string;
    questions_published: number;
  };
}

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: "Error",
  advertencia: "Advertencia",
  sugerencia: "Sugerencia",
};

const SEVERITY_ORDER: IssueSeverity[] = ["error", "advertencia", "sugerencia"];

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  estructura: "Estructura",
  logica: "Lógica",
  wording: "Wording",
  tipos: "Tipos",
  rangos: "Rangos",
  semantica: "Semántica",
};

const ALL_CATEGORIES: IssueCategory[] = [
  "estructura",
  "logica",
  "wording",
  "tipos",
  "rangos",
  "semantica",
];

/** Estado por check IA durante una corrida. */
interface AiCheckStatus {
  key: string;
  label: string;
  state: "pending" | "running" | "done" | "failed";
  count?: number;
  error?: string;
}

export function ValidationReport({
  questionnaireId,
  onBack,
  onOpenSettings,
}: ValidationReportProps) {
  const [row, setRow] = useState<QuestionnaireRow | null>(null);
  const [report, setReport] = useState<QuestionnaireValidationReport | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado de la corrida en curso.
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [includeAi, setIncludeAi] = useState(false);
  const [aiStatuses, setAiStatuses] = useState<AiCheckStatus[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Estado de la publicación en QuestionPro (modal abierta + tracking).
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishState, setPublishState] = useState<PublishState>({
    step: "idle",
  });
  const publishAbortRef = useRef<AbortController | null>(null);

  // Filtros: empiezan todos activados.
  const [severityFilter, setSeverityFilter] = useState<Set<IssueSeverity>>(
    new Set(SEVERITY_ORDER)
  );
  const [categoryFilter, setCategoryFilter] = useState<Set<IssueCategory>>(
    new Set(ALL_CATEGORIES)
  );

  // Carga inicial: cuestionario + última validación (si existe).
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, latest] = await Promise.all([
        getQuestionnaire(questionnaireId),
        getLatestValidation(questionnaireId),
      ]);
      setRow(q);
      setReport(latest);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [questionnaireId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Abortar la corrida al desmontar.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      publishAbortRef.current?.abort();
    };
  }, []);

  /**
   * Dispara la publicación a QP: lee las dos keys de settings, llama al
   * orchestrator y persiste `qp_published_survey_id` cuando termina ok.
   * Si falla a mitad, registra igual la encuesta parcial para que el usuario
   * la pueda abrir y completar manualmente.
   */
  const handlePublish = useCallback(async () => {
    if (!row?.questionnaire_json) return;
    const [apiKey, userId] = await Promise.all([
      getQuestionproApiKey(),
      getQuestionproUserId(),
    ]);
    if (!apiKey || !userId) {
      setPublishState({
        step: "error",
        error:
          !apiKey && !userId
            ? "Faltan la API key y el User ID de QuestionPro en Ajustes."
            : !apiKey
            ? "Falta la API key de QuestionPro en Ajustes."
            : "Falta el User ID de QuestionPro en Ajustes.",
      });
      return;
    }
    publishAbortRef.current?.abort();
    const ctrl = new AbortController();
    publishAbortRef.current = ctrl;
    setPublishState({
      step: "publishing",
      progress: { current: 0, total: row.questionnaire_json.preguntas.length },
    });
    try {
      const result = await publishQuestionnaireToQp(row.questionnaire_json, {
        userId,
        apiKey,
        surveyName: row.nombre,
        signal: ctrl.signal,
        onProgress: (info) => {
          setPublishState((cur) => ({
            ...cur,
            step: "publishing",
            progress: {
              current: info.publishedCount,
              total: info.totalCount,
            },
          }));
        },
      });
      await updateQpPublishedInfo(questionnaireId, result.qp_survey_id);
      setPublishState({
        step: "done",
        result: {
          qp_survey_id: result.qp_survey_id,
          qp_survey_url: result.qp_survey_url,
          warnings: result.warnings,
        },
      });
      // Refresh del row para reflejar el qp_published_survey_id.
      await load();
    } catch (err) {
      if (err instanceof PublishToQpError) {
        // Si hay partial (encuesta creada antes de fallar), persistimos el
        // qp_survey_id igual: el usuario por lo menos puede ir a verla.
        if (err.partial) {
          try {
            await updateQpPublishedInfo(
              questionnaireId,
              err.partial.qp_survey_id
            );
            await load();
          } catch {
            // Silencioso: lo importante es mostrar el error original.
          }
        }
        setPublishState({
          step: "error",
          error: err.message,
          errorAtIndex: err.atQuestionIndex,
          partial: err.partial,
        });
      } else {
        setPublishState({
          step: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, [row, questionnaireId, load]);

  const handleCancelPublish = useCallback(() => {
    publishAbortRef.current?.abort();
  }, []);

  const openPublishModal = useCallback(() => {
    setPublishState({ step: "idle" });
    setShowPublishModal(true);
  }, []);

  const closePublishModal = useCallback(() => {
    // No cerramos durante una publicación en curso para evitar dejar la
    // request huérfana sin que el usuario se entere de su resultado.
    if (publishState.step === "publishing") return;
    setShowPublishModal(false);
  }, [publishState.step]);

  const handleValidate = useCallback(async () => {
    if (!row?.questionnaire_json) {
      setValidationError(
        "El cuestionario está vacío o sin JSON. Volvé al editor y agregá preguntas antes de validar."
      );
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setValidating(true);
    setValidationError(null);
    setAiStatuses([]);

    try {
      const newReport = await runValidation(
        questionnaireId,
        row.questionnaire_json,
        {
          runAiChecks: includeAi,
          signal: ctrl.signal,
          onProgress: (ev) => handleProgress(ev, setAiStatuses),
        }
      );
      setReport(newReport);
    } catch (err) {
      if (
        err instanceof DOMException && err.name === "AbortError"
      ) {
        setValidationError("Validación cancelada.");
      } else {
        setValidationError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setValidating(false);
      // No limpiamos aiStatuses para que el usuario pueda ver qué pasó.
    }
  }, [questionnaireId, row, includeAi]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando reporte…
        </div>
      </div>
    );
  }

  if (loadError || !row) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">
              No se pudo cargar el cuestionario
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {loadError ?? "Cuestionario no encontrado"}
          </pre>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>
              Volver
            </Button>
            <Button size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Permitir publicar sólo si hay reporte sin errores y al menos una pregunta.
  // Con `advertencia`/`sugerencia` permitimos publicar pero pediremos
  // confirmación dentro del modal.
  const hasPreguntas = (row.questionnaire_json?.preguntas?.length ?? 0) > 0;
  const errorsCount = report?.resumen.errors ?? 0;
  const canPublish = hasPreguntas && errorsCount === 0;
  const alreadyPublished = !!row.qp_published_survey_id;

  return (
    <div className="flex flex-col gap-4">
      <Header
        nombre={row.nombre}
        onBack={onBack}
        onValidate={() => void handleValidate()}
        onCancel={handleCancel}
        validating={validating}
        hasReport={!!report}
        includeAi={includeAi}
        onIncludeAiChange={setIncludeAi}
        canPublish={canPublish}
        alreadyPublished={alreadyPublished}
        onPublish={openPublishModal}
        publishDisabledReason={
          !hasPreguntas
            ? "El cuestionario no tiene preguntas para publicar."
            : errorsCount > 0
            ? `Resolvé los ${errorsCount} errores antes de publicar.`
            : undefined
        }
      />

      {showPublishModal && row.questionnaire_json && (
        <PublishModal
          questionnaire={row.questionnaire_json}
          state={publishState}
          report={report}
          alreadyPublishedId={row.qp_published_survey_id}
          onConfirm={() => void handlePublish()}
          onCancel={handleCancelPublish}
          onClose={closePublishModal}
          onOpenSettings={onOpenSettings}
        />
      )}

      {validating && (
        <ProgressPanel includeAi={includeAi} statuses={aiStatuses} />
      )}

      {validationError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 pt-6 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <pre className="whitespace-pre-wrap break-all font-mono">
              {validationError}
            </pre>
          </CardContent>
        </Card>
      )}

      {!report ? (
        <EmptyState
          onValidate={() => void handleValidate()}
          validating={validating}
        />
      ) : (
        <ReportBody
          report={report}
          severityFilter={severityFilter}
          onToggleSeverity={(s) => toggleInSet(setSeverityFilter, s)}
          categoryFilter={categoryFilter}
          onToggleCategory={(c) => toggleInSet(setCategoryFilter, c)}
        />
      )}
    </div>
  );
}

function handleProgress(
  ev: ValidationProgressEvent,
  setStatuses: React.Dispatch<React.SetStateAction<AiCheckStatus[]>>
) {
  if (ev.type === "ai_check_start") {
    setStatuses((cur) => {
      const i = cur.findIndex((s) => s.key === ev.key);
      const next: AiCheckStatus = { key: ev.key, label: ev.label, state: "running" };
      if (i < 0) return [...cur, next];
      const copy = cur.slice();
      copy[i] = next;
      return copy;
    });
  }
  if (ev.type === "ai_check_done") {
    setStatuses((cur) =>
      cur.map((s) =>
        s.key === ev.key
          ? { ...s, state: "done", count: ev.count }
          : s
      )
    );
  }
  if (ev.type === "ai_check_failed") {
    setStatuses((cur) =>
      cur.map((s) =>
        s.key === ev.key
          ? { ...s, state: "failed", error: ev.error }
          : s
      )
    );
  }
}

function toggleInSet<T>(
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
  value: T
) {
  setter((cur) => {
    const next = new Set(cur);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

// ---------------------------------------------------------------------------
// Header con toggle IA
// ---------------------------------------------------------------------------

interface HeaderProps {
  nombre: string;
  onBack: () => void;
  onValidate: () => void;
  onCancel: () => void;
  validating: boolean;
  hasReport: boolean;
  includeAi: boolean;
  onIncludeAiChange: (v: boolean) => void;
  canPublish: boolean;
  alreadyPublished: boolean;
  onPublish: () => void;
  /** Texto descriptivo del por qué está deshabilitado (tooltip). Si está
   *  habilitado, undefined. */
  publishDisabledReason?: string;
}

function Header({
  nombre,
  onBack,
  onValidate,
  onCancel,
  validating,
  hasReport,
  includeAi,
  onIncludeAiChange,
  canPublish,
  alreadyPublished,
  onPublish,
  publishDisabledReason,
}: HeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={validating}
          className="gap-1"
        >
          <ArrowLeft className="size-4" />
          Volver al editor
        </Button>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{nombre}</h2>
          <span className="text-xs text-muted-foreground">
            Reporte de validación
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="include-ai"
            checked={includeAi}
            onCheckedChange={onIncludeAiChange}
            disabled={validating}
          />
          <Label
            htmlFor="include-ai"
            className="flex items-center gap-1 text-xs font-normal"
          >
            <Sparkles className="size-3.5" />
            Incluir checks con IA
          </Label>
        </div>
        {validating ? (
          <Button
            variant="outline"
            onClick={onCancel}
            className="gap-2"
          >
            <Ban className="size-4" />
            Cancelar
          </Button>
        ) : (
          <Button onClick={onValidate} className="gap-2" variant="outline">
            <RefreshCw className="size-4" />
            {hasReport ? "Re-validar" : "Validar ahora"}
          </Button>
        )}
        <Button
          onClick={onPublish}
          disabled={validating || !canPublish}
          className="gap-2"
          title={publishDisabledReason}
        >
          {alreadyPublished ? (
            <RefreshCw className="size-4" />
          ) : (
            <Upload className="size-4" />
          )}
          {alreadyPublished ? "Re-publicar en QP" : "Publicar en QP"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de publicación a QuestionPro (Iteración 8)
// ---------------------------------------------------------------------------

interface PublishModalProps {
  questionnaire: NonNullable<QuestionnaireRow["questionnaire_json"]>;
  state: PublishState;
  report: QuestionnaireValidationReport | null;
  alreadyPublishedId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  onOpenSettings?: () => void;
}

/**
 * Modal estilo "drawer" — no usamos shadcn Dialog para no agregar otra
 * dependencia: un overlay full-screen sobre la pantalla del reporte.
 * El usuario confirma → publish, ve progreso, y al final tiene URL + warnings.
 */
function PublishModal({
  questionnaire,
  state,
  report,
  alreadyPublishedId,
  onConfirm,
  onCancel,
  onClose,
  onOpenSettings,
}: PublishModalProps) {
  const totalPreguntas = questionnaire.preguntas.length;
  const totalConFlujo = questionnaire.preguntas.filter(
    (q) => q.flujo.length > 0 || q.condicion.trim().length > 0
  ).length;
  const hasWarnings = (report?.resumen.advertencias ?? 0) > 0;
  const hasSugerencias = (report?.resumen.sugerencias ?? 0) > 0;
  const isRunning = state.step === "publishing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={isRunning ? undefined : onClose}
    >
      <Card
        className="w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4" />
            Publicar en QuestionPro
          </CardTitle>
          <CardDescription>
            Se va a crear una encuesta nueva en QP con las preguntas y opciones
            del cuestionario validado. La skip-logic no se publica
            automáticamente — la completás en el panel de QP.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {state.step === "idle" && (
            <>
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    <span className="font-medium">{totalPreguntas}</span>{" "}
                    preguntas
                  </span>
                  <span>
                    <span className="font-medium">{totalConFlujo}</span> con
                    flujo/condición
                  </span>
                  <span>
                    <span className="font-medium">
                      {questionnaire.secciones.length}
                    </span>{" "}
                    secciones
                  </span>
                </div>
              </div>
              {alreadyPublishedId && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
                  Este cuestionario ya está publicado como encuesta{" "}
                  <span className="font-mono">{alreadyPublishedId}</span> en QP.
                  Continuar va a crear una encuesta nueva (QP no soporta
                  "actualizar"). La anterior queda intacta.
                </div>
              )}
              {(hasWarnings || hasSugerencias) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  Tu cuestionario tiene{" "}
                  {hasWarnings && (
                    <span>
                      <span className="font-medium">
                        {report?.resumen.advertencias}
                      </span>{" "}
                      advertencias
                    </span>
                  )}
                  {hasWarnings && hasSugerencias && " y "}
                  {hasSugerencias && (
                    <span>
                      <span className="font-medium">
                        {report?.resumen.sugerencias}
                      </span>{" "}
                      sugerencias
                    </span>
                  )}{" "}
                  pendientes. Podés publicar igual, pero conviene revisarlas
                  primero.
                </div>
              )}
            </>
          )}

          {state.step === "publishing" && state.progress && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Publicando preguntas…
                </span>
                <span className="font-mono">
                  {state.progress.current}/{state.progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      state.progress.total === 0
                        ? 0
                        : (state.progress.current / state.progress.total) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {state.step === "done" && state.result && (
            <PublishResult result={state.result} />
          )}

          {state.step === "error" && (
            <div className="flex flex-col gap-2">
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertCircle className="size-4" />
                  No se pudo publicar
                </div>
                <p className="mt-1 whitespace-pre-wrap">{state.error}</p>
                {state.errorAtIndex != null && (
                  <p className="mt-1 text-muted-foreground">
                    Falló en la pregunta #{state.errorAtIndex + 1}.
                  </p>
                )}
                {state.partial && state.partial.qp_survey_url && (
                  <p className="mt-2">
                    La encuesta parcial ya existe en QP con{" "}
                    {state.partial.questions_published} preguntas creadas
                    antes del error:{" "}
                    <a
                      href={state.partial.qp_survey_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      abrir en QP
                    </a>
                    .
                  </p>
                )}
              </div>
              {/* Si el error es por falta de credenciales, shortcut a Ajustes. */}
              {/falta(n)? (la )?api key|user id/i.test(state.error ?? "") &&
                onOpenSettings && (
                  <Button size="sm" variant="outline" onClick={onOpenSettings}>
                    Ir a Ajustes
                  </Button>
                )}
            </div>
          )}
        </CardContent>
        <CardContent className="flex justify-end gap-2 border-t pt-4">
          {state.step === "idle" && (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={onConfirm} className="gap-2">
                <Upload className="size-4" />
                Publicar ahora
              </Button>
            </>
          )}
          {state.step === "publishing" && (
            <Button variant="outline" onClick={onCancel} className="gap-2">
              <Ban className="size-4" />
              Cancelar (se conserva lo publicado)
            </Button>
          )}
          {(state.step === "done" || state.step === "error") && (
            <Button onClick={onClose}>Cerrar</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PublishResult({
  result,
}: {
  result: NonNullable<PublishState["result"]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="size-4" />
          <span className="font-medium">Encuesta creada en QuestionPro</span>
        </div>
        <p className="mt-1">
          Survey ID:{" "}
          <span className="font-mono">{result.qp_survey_id}</span>
        </p>
        {result.qp_survey_url && (
          <a
            href={result.qp_survey_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-emerald-400 underline"
          >
            <ExternalLink className="size-3.5" />
            Abrir en QuestionPro
          </a>
        )}
      </div>
      {result.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-300">
            <AlertTriangle className="size-4" />
            Cosas para terminar a mano en QP ({result.warnings.length})
          </p>
          <ul className="ml-4 flex list-disc flex-col gap-1 text-xs">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel de progreso (durante una corrida)
// ---------------------------------------------------------------------------

function ProgressPanel({
  includeAi,
  statuses,
}: {
  includeAi: boolean;
  statuses: AiCheckStatus[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin" />
          Validando…
        </CardTitle>
        <CardDescription>
          {includeAi
            ? "Corren los checks deterministicos y después los semánticos con IA. Cada categoría es una llamada a OpenAI; podés cancelar en cualquier momento."
            : "Corren sólo los checks deterministicos (no usan IA)."}
        </CardDescription>
      </CardHeader>
      {includeAi && statuses.length > 0 && (
        <CardContent className="flex flex-col gap-1.5">
          {statuses.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <ProgressIcon state={s.state} />
                <span>{s.label}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {s.state === "done"
                  ? `${s.count ?? 0} ${
                      (s.count ?? 0) === 1 ? "issue" : "issues"
                    }`
                  : s.state === "failed"
                  ? `Falló: ${s.error ?? "error desconocido"}`
                  : s.state === "running"
                  ? "En curso…"
                  : "Pendiente"}
              </span>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function ProgressIcon({ state }: { state: AiCheckStatus["state"] }) {
  if (state === "running")
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (state === "done")
    return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  if (state === "failed")
    return <XCircle className="size-3.5 text-destructive" />;
  return <span className="size-3.5 rounded-full border border-muted-foreground/40" />;
}

// ---------------------------------------------------------------------------
// Empty state — el cuestionario nunca se validó
// ---------------------------------------------------------------------------

function EmptyState({
  onValidate,
  validating,
}: {
  onValidate: () => void;
  validating: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sin validaciones todavía</CardTitle>
        <CardDescription>
          Corré la validación para detectar problemas en el cuestionario. Los
          checks deterministicos son rápidos y gratis: IDs duplicados, flujos
          rotos, rangos inválidos. Activá "Incluir checks con IA" para sumar
          análisis semántico (redundancia, sesgo, MECE, etc.) — usa el modelo
          configurado en Ajustes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onValidate} disabled={validating} className="gap-2">
          {validating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Validar ahora
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cuerpo del reporte (resumen + filtros + groups)
// ---------------------------------------------------------------------------

interface ReportBodyProps {
  report: QuestionnaireValidationReport;
  severityFilter: Set<IssueSeverity>;
  onToggleSeverity: (s: IssueSeverity) => void;
  categoryFilter: Set<IssueCategory>;
  onToggleCategory: (c: IssueCategory) => void;
}

function ReportBody({
  report,
  severityFilter,
  onToggleSeverity,
  categoryFilter,
  onToggleCategory,
}: ReportBodyProps) {
  const validatedAt = useMemo(
    () => new Date(report.validated_at).toLocaleString(),
    [report.validated_at]
  );

  // Determinar qué categorías están presentes en el reporte para mostrar
  // sólo esos filtros (evita ofrecer "Tipos" si no hay ningún issue de tipos).
  const presentCategories = useMemo(() => {
    const set = new Set<IssueCategory>();
    for (const i of report.issues_globales) set.add(i.categoria);
    for (const g of report.issues_por_pregunta)
      for (const i of g.issues) set.add(i.categoria);
    return ALL_CATEGORIES.filter((c) => set.has(c));
  }, [report]);

  const filterIssue = useCallback(
    (i: QCIssue) =>
      severityFilter.has(i.severidad) && categoryFilter.has(i.categoria),
    [severityFilter, categoryFilter]
  );

  const filteredGlobales = report.issues_globales.filter(filterIssue);
  const filteredGroups = report.issues_por_pregunta
    .map((g) => ({ ...g, issues: g.issues.filter(filterIssue) }))
    .filter((g) => g.issues.length > 0);

  const allClean = report.resumen.total === 0;
  const someHidden =
    !allClean &&
    filteredGlobales.length + filteredGroups.reduce((acc, g) => acc + g.issues.length, 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      <Summary report={report} validatedAt={validatedAt} />

      {!allClean && (
        <Filters
          severityFilter={severityFilter}
          onToggleSeverity={onToggleSeverity}
          categoryFilter={categoryFilter}
          onToggleCategory={onToggleCategory}
          presentCategories={presentCategories}
        />
      )}

      {allClean && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            ¡Cuestionario limpio! No se detectaron problemas.
          </CardContent>
        </Card>
      )}

      {someHidden && (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
            <Info className="size-4" />
            Los filtros aplicados ocultan todos los issues. Tocá los badges de
            arriba para volver a mostrarlos.
          </CardContent>
        </Card>
      )}

      {filteredGlobales.length > 0 && (
        <GlobalIssues issues={filteredGlobales} />
      )}

      {filteredGroups.length > 0 && (
        <PerQuestionIssues groups={filteredGroups} />
      )}
    </div>
  );
}

function Summary({
  report,
  validatedAt,
}: {
  report: QuestionnaireValidationReport;
  validatedAt: string;
}) {
  const { errors, advertencias, sugerencias, total } = report.resumen;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-6">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total de issues</span>
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
        </div>
        <div className="flex items-center gap-4">
          <SummaryStat
            label="Errores"
            value={errors}
            icon={<XCircle className="size-4 text-destructive" />}
          />
          <SummaryStat
            label="Advertencias"
            value={advertencias}
            icon={<AlertTriangle className="size-4 text-amber-500" />}
          />
          <SummaryStat
            label="Sugerencias"
            value={sugerencias}
            icon={<Info className="size-4 text-sky-500" />}
          />
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          Validado: {validatedAt}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtros (severidad + categoría)
// ---------------------------------------------------------------------------

interface FiltersProps {
  severityFilter: Set<IssueSeverity>;
  onToggleSeverity: (s: IssueSeverity) => void;
  categoryFilter: Set<IssueCategory>;
  onToggleCategory: (c: IssueCategory) => void;
  presentCategories: IssueCategory[];
}

function Filters({
  severityFilter,
  onToggleSeverity,
  categoryFilter,
  onToggleCategory,
  presentCategories,
}: FiltersProps) {
  if (presentCategories.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Severidad:
          </span>
          {SEVERITY_ORDER.map((s) => (
            <ToggleBadge
              key={s}
              active={severityFilter.has(s)}
              onClick={() => onToggleSeverity(s)}
              label={SEVERITY_LABEL[s]}
              color={severityColor(s)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Categoría:
          </span>
          {presentCategories.map((c) => (
            <ToggleBadge
              key={c}
              active={categoryFilter.has(c)}
              onClick={() => onToggleCategory(c)}
              label={CATEGORY_LABEL[c]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleBadge({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors",
        active
          ? color ?? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted/20 text-muted-foreground line-through opacity-60 hover:opacity-100"
      )}
    >
      {label}
    </button>
  );
}

function severityColor(s: IssueSeverity): string {
  if (s === "error")
    return "border-destructive/40 bg-destructive/10 text-destructive";
  if (s === "advertencia")
    return "border-amber-500/40 bg-amber-500/10 text-amber-500";
  return "border-sky-500/40 bg-sky-500/10 text-sky-500";
}

// ---------------------------------------------------------------------------
// Listas de issues
// ---------------------------------------------------------------------------

function GlobalIssues({ issues }: { issues: QCIssue[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Issues globales</CardTitle>
        <CardDescription>
          Problemas que no son específicos de una pregunta (referencias rotas
          en secciones, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {issues.map((issue, i) => (
          <IssueRow key={i} issue={issue} />
        ))}
      </CardContent>
    </Card>
  );
}

function PerQuestionIssues({
  groups,
}: {
  groups: QuestionnaireValidationReport["issues_por_pregunta"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">
        Por pregunta
      </h3>
      {groups.map((g) => (
        <Card key={g.pregunta_id}>
          <CardHeader>
            <CardTitle className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {g.pregunta_id}
              </span>{" "}
              · Pregunta {g.pregunta_numero}
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {g.pregunta_texto}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {g.issues.map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IssueRow({ issue }: { issue: QCIssue }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <SeverityIcon severity={issue.severidad} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={issue.severidad} />
          <Badge variant="outline" className="font-normal">
            {CATEGORY_LABEL[issue.categoria]}
          </Badge>
        </div>
        <p className="text-sm leading-snug">{issue.descripcion}</p>
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === "error")
    return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />;
  if (severity === "advertencia")
    return (
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
    );
  return <Info className="mt-0.5 size-4 shrink-0 text-sky-500" />;
}

function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return (
    <Badge variant="outline" className={`font-normal ${severityColor(severity)}`}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}
