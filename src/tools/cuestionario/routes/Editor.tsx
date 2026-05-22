// Editor tipado del cuestionario (Iteración 4 + rediseño Validador UX).
//
// Workspace de "pregunta única en foco": mini-mapa lateral con todas las
// preguntas + stepper horizontal con círculos numerados arriba + card con la
// pregunta enfocada. Navegación con teclado (← / →). Validación inline de
// checks deterministicos (sin IA — eso es on-demand desde el reporte).
//
// Tiene un toggle "Modo código" para volver al textarea raw cuando el
// usuario quiere editar el JSON canónico a mano. Los dos modos comparten
// state local; cambiar de modo no pierde cambios sin guardar.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Braces,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  LayoutList,
  Loader2,
  Plus,
  Save,
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
import { Separator } from "@/components/ui/separator";
import { runDeterministicChecks } from "@/lib/cuestionario/checks";
import {
  getQuestionnaire,
  updateQuestionnaireJson,
} from "@/lib/cuestionario/questionnaire-repository";
import {
  emptyQuestionnaire,
  type QCIssue,
  type Question,
  type QuestionType,
  type Questionnaire,
  type QuestionnaireRow,
} from "@/lib/cuestionario/types";
import { MetadataPanel } from "./editor/MetadataPanel";
import { QuestionCard } from "./editor/QuestionCard";
import {
  QuestionStepper,
  type StepperItem,
  type StepStatus,
} from "./editor/QuestionStepper";
import {
  QuestionMiniMap,
  type MiniMapItem,
} from "./editor/QuestionMiniMap";

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  cerrada_unica: "Cerrada única",
  cerrada_multiple: "Cerrada múltiple",
  escala: "Escala",
  matriz: "Matriz",
  abierta_texto: "Abierta · texto",
  abierta_marca: "Abierta · marca",
  numerica: "Numérica",
  ranking: "Ranking",
  fecha: "Fecha",
};

function deriveStatus(q: Question, issues: QCIssue[]): StepStatus {
  if (issues.some((i) => i.severidad === "error")) return "err";
  if (issues.some((i) => i.severidad !== "error")) return "warn";
  if (!q.texto || !q.texto.trim()) return "empty";
  return "ok";
}

type EditorMode = "typed" | "code";

export interface EditorProps {
  questionnaireId: string;
  onBack: () => void;
  onOpenReport: () => void;
}

export function Editor({ questionnaireId, onBack, onOpenReport }: EditorProps) {
  const [row, setRow] = useState<QuestionnaireRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado del editor: el Questionnaire en edición. dirty=true cuando difiere
  // de lo persistido.
  const [draft, setDraft] = useState<Questionnaire | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [mode, setMode] = useState<EditorMode>("typed");

  // Índice de la pregunta enfocada (single-focus). Se mantiene a nivel del
  // Editor para que sobreviva a re-renders del subárbol y para que el handler
  // de teclado pueda actualizar el foco sin pasar por TypedMode.
  const [activeIndex, setActiveIndex] = useState(0);

  // Estado del modo código: el textarea trabaja con un string que puede ser
  // momentáneamente JSON inválido; sólo se parsea al cambiar de modo o guardar.
  const [codeDraft, setCodeDraft] = useState<string>("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // Carga inicial.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await getQuestionnaire(questionnaireId);
      setRow(r);
      const initial =
        r.questionnaire_json ??
        emptyQuestionnaire({ titulo: r.nombre, idioma: "es" });
      setDraft(initial);
      setCodeDraft(JSON.stringify(initial, null, 2));
      setDirty(false);
      setSavedAt(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [questionnaireId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Validación inline: corre checks deterministicos sobre el draft. Sin
  // memoria: el cálculo es barato (sub-ms para cuestionarios de cientos de
  // preguntas) — useMemo igual evita recomputar en re-renders no relacionados.
  const inlineIssues = useMemo(() => {
    if (!draft) return null;
    return runDeterministicChecks(draft);
  }, [draft]);

  const issuesByQuestion = useMemo<Map<string, QCIssue[]>>(() => {
    const map = new Map<string, QCIssue[]>();
    if (!inlineIssues || !draft) return map;
    for (const issue of inlineIssues) {
      if (!issue.pregunta_id) continue;
      const arr = map.get(issue.pregunta_id) ?? [];
      arr.push(issue);
      map.set(issue.pregunta_id, arr);
    }
    return map;
  }, [inlineIssues, draft]);

  const globalIssues = useMemo<QCIssue[]>(() => {
    if (!inlineIssues || !draft) return [];
    const validIds = new Set(draft.preguntas.map((p) => p.id));
    return inlineIssues.filter(
      (i) => !i.pregunta_id || !validIds.has(i.pregunta_id)
    );
  }, [inlineIssues, draft]);

  const summary = useMemo(() => {
    if (!inlineIssues) return { errors: 0, advertencias: 0, sugerencias: 0 };
    return inlineIssues.reduce(
      (acc, i) => {
        if (i.severidad === "error") acc.errors++;
        else if (i.severidad === "advertencia") acc.advertencias++;
        else acc.sugerencias++;
        return acc;
      },
      { errors: 0, advertencias: 0, sugerencias: 0 }
    );
  }, [inlineIssues]);

  // ----- mutators -----

  const updateDraft = useCallback(
    (mutator: (cur: Questionnaire) => Questionnaire) => {
      setDraft((cur) => {
        if (!cur) return cur;
        const next = mutator(cur);
        setDirty(true);
        setSaveError(null);
        // Si estamos en modo código, sincronizamos el textarea también.
        setCodeDraft(JSON.stringify(next, null, 2));
        return next;
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Si el usuario está en modo código, primero parsear el draft de texto.
      if (mode === "code") {
        const parsed = parseCode(codeDraft);
        await updateQuestionnaireJson(questionnaireId, parsed);
        setDraft(parsed);
      } else {
        await updateQuestionnaireJson(questionnaireId, draft);
      }
      setDirty(false);
      setSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, mode, codeDraft, questionnaireId]);

  function switchMode(next: EditorMode) {
    if (next === mode) return;
    if (next === "code") {
      // Pasando a código: serializamos el draft actual para el textarea.
      if (draft) setCodeDraft(JSON.stringify(draft, null, 2));
      setCodeError(null);
      setMode("code");
    } else {
      // Volviendo a tipado: validar el JSON crudo. Si está roto, no permitir
      // el cambio (mantenemos al usuario en código para que arregle).
      try {
        const parsed = parseCode(codeDraft);
        setDraft(parsed);
        setCodeError(null);
        setMode("typed");
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ----- handlers de preguntas -----

  const updateQuestion = useCallback(
    (index: number, next: Question) => {
      updateDraft((cur) => ({
        ...cur,
        preguntas: cur.preguntas.map((p, i) => (i === index ? next : p)),
      }));
    },
    [updateDraft]
  );

  const addQuestion = useCallback(
    (tipo: QuestionType = "cerrada_unica") => {
      updateDraft((cur) => {
        const id = nextQuestionId(cur);
        const numero = cur.preguntas.length + 1;
        const newQ: Question = {
          id,
          numero,
          texto: "",
          tipo,
          condicion: "",
          aleatorizar: false,
          opciones: [],
          flujo: [],
        };
        // Mover el foco a la pregunta recién creada.
        setActiveIndex(cur.preguntas.length);
        return { ...cur, preguntas: [...cur.preguntas, newQ] };
      });
    },
    [updateDraft]
  );

  const deleteQuestion = useCallback(
    (index: number) => {
      updateDraft((cur) => {
        const next = cur.preguntas
          .filter((_, i) => i !== index)
          .map((p, i) => ({ ...p, numero: i + 1 }));
        // Clampear el foco: si borraste la última, retrocedé una.
        setActiveIndex((cur) =>
          Math.max(0, Math.min(cur, next.length - 1))
        );
        return { ...cur, preguntas: next };
      });
    },
    [updateDraft]
  );

  const duplicateQuestion = useCallback(
    (index: number) => {
      updateDraft((cur) => {
        const orig = cur.preguntas[index];
        if (!orig) return cur;
        const clone: Question = {
          ...orig,
          id: nextQuestionId(cur, orig.id),
          opciones: orig.opciones.map((o) => ({ ...o })),
          flujo: orig.flujo.map((f) => ({ ...f })),
          enunciados: orig.enunciados?.map((e) => ({ ...e })),
        };
        const preguntas = [...cur.preguntas];
        preguntas.splice(index + 1, 0, clone);
        // Saltar el foco al clon.
        setActiveIndex(index + 1);
        return {
          ...cur,
          preguntas: preguntas.map((p, i) => ({ ...p, numero: i + 1 })),
        };
      });
    },
    [updateDraft]
  );

  const moveQuestion = useCallback(
    (from: number, to: number) => {
      updateDraft((cur) => {
        if (from === to || from < 0 || to < 0) return cur;
        if (from >= cur.preguntas.length || to >= cur.preguntas.length) return cur;
        const preguntas = [...cur.preguntas];
        const [moved] = preguntas.splice(from, 1);
        preguntas.splice(to, 0, moved);
        // Seguir el item movido para que el foco no se desincronice.
        setActiveIndex(to);
        return {
          ...cur,
          preguntas: preguntas.map((p, i) => ({ ...p, numero: i + 1 })),
        };
      });
    },
    [updateDraft]
  );

  // Clamp del foco cuando cambia el largo de la lista (carga inicial,
  // recarga, etc.) — protege contra activeIndex > preguntas.length-1.
  useEffect(() => {
    if (!draft) return;
    const max = Math.max(0, draft.preguntas.length - 1);
    setActiveIndex((i) => Math.min(Math.max(0, i), max));
  }, [draft?.preguntas.length]);

  // Navegación con teclado: ← / → entre preguntas. Se ignora cuando el foco
  // está sobre un input editable (textarea, input, contenteditable) para no
  // robar las flechas del cursor de texto.
  useEffect(() => {
    if (mode !== "typed") return;
    if (!draft) return;
    const total = draft.preguntas.length;
    if (total <= 1) return;
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(total - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, draft?.preguntas.length]);

  // ----- render -----

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando cuestionario…
        </div>
      </div>
    );
  }

  if (loadError || !row || !draft) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">No se pudo cargar el cuestionario</span>
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

  return (
    <div className="flex flex-col gap-4">
      <Header
        nombre={row.nombre}
        origen={row.origen}
        preguntasCount={draft.preguntas.length}
        dirty={dirty}
        savedAt={savedAt}
        saving={saving}
        onBack={() => {
          if (dirty && !window.confirm("Hay cambios sin guardar. ¿Salir de todas formas?")) {
            return;
          }
          onBack();
        }}
        onSave={() => void handleSave()}
        onOpenReport={() => {
          if (
            dirty &&
            !window.confirm(
              "Hay cambios sin guardar; el reporte se va a calcular sobre la última versión guardada. ¿Continuar?"
            )
          ) {
            return;
          }
          onOpenReport();
        }}
        mode={mode}
        onModeChange={switchMode}
      />

      <InlineSummary
        errors={summary.errors}
        advertencias={summary.advertencias}
        sugerencias={summary.sugerencias}
      />

      {saveError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 pt-6 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <pre className="whitespace-pre-wrap break-all font-mono">
              {saveError}
            </pre>
          </CardContent>
        </Card>
      )}

      {mode === "typed" ? (
        <TypedMode
          draft={draft}
          activeIndex={Math.min(
            Math.max(0, activeIndex),
            Math.max(0, draft.preguntas.length - 1)
          )}
          onActiveIndexChange={setActiveIndex}
          issuesByQuestion={issuesByQuestion}
          globalIssues={globalIssues}
          disabled={saving}
          onMetadataChange={(metadata) =>
            updateDraft((cur) => ({ ...cur, metadata }))
          }
          onQuestionChange={updateQuestion}
          onAddQuestion={() => addQuestion()}
          onDeleteQuestion={deleteQuestion}
          onDuplicateQuestion={duplicateQuestion}
          onMoveQuestion={moveQuestion}
        />
      ) : (
        <CodeMode
          value={codeDraft}
          onChange={(text) => {
            setCodeDraft(text);
            setDirty(true);
            setCodeError(null);
          }}
          error={codeError}
          disabled={saving}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  nombre: string;
  origen: string;
  preguntasCount: number;
  dirty: boolean;
  savedAt: Date | null;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  onOpenReport: () => void;
  mode: EditorMode;
  onModeChange: (next: EditorMode) => void;
}

function Header({
  nombre,
  origen,
  preguntasCount,
  dirty,
  savedAt,
  saving,
  onBack,
  onSave,
  onOpenReport,
  mode,
  onModeChange,
}: HeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={saving}
          className="gap-1"
        >
          <ArrowLeft className="size-4" />
          Volver
        </Button>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{nombre}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-normal">
              {origen}
            </Badge>
            <span>
              {preguntasCount} pregunta{preguntasCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Toggle modo. */}
        <div className="flex items-center rounded-md border border-input p-0.5">
          <Button
            type="button"
            size="sm"
            variant={mode === "typed" ? "secondary" : "ghost"}
            onClick={() => onModeChange("typed")}
            disabled={saving}
            className="h-7 gap-1 px-2 text-xs"
            aria-pressed={mode === "typed"}
          >
            <LayoutList className="size-3.5" />
            Tipado
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "code" ? "secondary" : "ghost"}
            onClick={() => onModeChange("code")}
            disabled={saving}
            className="h-7 gap-1 px-2 text-xs"
            aria-pressed={mode === "code"}
          >
            <Code2 className="size-3.5" />
            Código
          </Button>
        </div>

        {savedAt && !dirty && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Guardado {savedAt.toLocaleTimeString()}
          </span>
        )}
        <Button
          variant="outline"
          onClick={onOpenReport}
          disabled={saving}
          className="gap-2"
        >
          <ClipboardCheck className="size-4" />
          Ver reporte
        </Button>
        <Button
          onClick={onSave}
          disabled={!dirty || saving}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen de issues inline
// ---------------------------------------------------------------------------

function InlineSummary({
  errors,
  advertencias,
  sugerencias,
}: {
  errors: number;
  advertencias: number;
  sugerencias: number;
}) {
  const total = errors + advertencias + sugerencias;
  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Sin problemas detectados por los checks deterministicos. (Los checks
        semánticos con IA se corren on-demand desde "Ver reporte".)
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        Validación inline (sólo deterministicos):
      </span>
      {errors > 0 && (
        <Badge
          variant="outline"
          className="border-destructive/40 bg-destructive/10 font-normal text-destructive"
        >
          {errors} {errors === 1 ? "error" : "errores"}
        </Badge>
      )}
      {advertencias > 0 && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 font-normal text-amber-500"
        >
          {advertencias} {advertencias === 1 ? "advertencia" : "advertencias"}
        </Badge>
      )}
      {sugerencias > 0 && (
        <Badge
          variant="outline"
          className="border-sky-500/40 bg-sky-500/10 font-normal text-sky-500"
        >
          {sugerencias} {sugerencias === 1 ? "sugerencia" : "sugerencias"}
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modo tipado: metadata + workspace de pregunta única en foco
// ---------------------------------------------------------------------------
//
// Layout (Validador UX rediseño):
//   ┌───────────────────────────────────────────┐
//   │ MetadataPanel (colapsable)                │
//   │ Issues globales                           │
//   │ ┌─Mapa──┐  ┌─Stepper P1 P2 P3 … +───────┐ │
//   │ │ rail  │  ├──────────────────────────  │ │
//   │ │ lista │  │ QuestionCard (pregunta en  │ │
//   │ │ + %   │  │  foco, una sola)           │ │
//   │ │       │  └────────────────────────────┘ │
//   │ └───────┘                                 │
//   └───────────────────────────────────────────┘

interface TypedModeProps {
  draft: Questionnaire;
  activeIndex: number;
  onActiveIndexChange: (next: number) => void;
  issuesByQuestion: Map<string, QCIssue[]>;
  globalIssues: QCIssue[];
  disabled: boolean;
  onMetadataChange: (md: Questionnaire["metadata"]) => void;
  onQuestionChange: (index: number, q: Question) => void;
  onAddQuestion: () => void;
  onDeleteQuestion: (index: number) => void;
  onDuplicateQuestion: (index: number) => void;
  onMoveQuestion: (from: number, to: number) => void;
}

function TypedMode({
  draft,
  activeIndex,
  onActiveIndexChange,
  issuesByQuestion,
  globalIssues,
  disabled,
  onMetadataChange,
  onQuestionChange,
  onAddQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
  onMoveQuestion,
}: TypedModeProps) {
  const stepperItems: StepperItem[] = useMemo(
    () =>
      draft.preguntas.map((p) => ({
        code: p.id || `#${p.numero}`,
        status: deriveStatus(p, issuesByQuestion.get(p.id) ?? []),
      })),
    [draft.preguntas, issuesByQuestion]
  );

  const miniMapItems: MiniMapItem[] = useMemo(
    () =>
      draft.preguntas.map((p, i) => ({
        code: stepperItems[i]?.code ?? p.id,
        status: stepperItems[i]?.status ?? "empty",
        text: p.texto,
        typeLabel: QUESTION_TYPE_LABEL[p.tipo],
      })),
    [draft.preguntas, stepperItems]
  );

  const focused = draft.preguntas[activeIndex];

  return (
    <div className="flex flex-col gap-4">
      <MetadataPanel
        value={draft.metadata}
        onChange={onMetadataChange}
        disabled={disabled}
      />

      {/* Issues globales (referencias rotas, etc.) */}
      {globalIssues.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-sm">Issues globales</CardTitle>
            <CardDescription className="text-xs">
              Problemas que no son específicos de una pregunta. Se actualizan
              en vivo a medida que editás.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {globalIssues.map((i, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs"
              >
                <Badge variant="outline" className="mr-2 font-normal">
                  {i.severidad}
                </Badge>
                {i.descripcion}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {draft.preguntas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <Braces className="size-10 opacity-50" />
            <p>Este cuestionario no tiene preguntas todavía.</p>
            <Button onClick={onAddQuestion} disabled={disabled} className="gap-2">
              <Plus className="size-4" />
              Agregar la primera pregunta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Rail izquierdo: mini-mapa */}
          <QuestionMiniMap
            items={miniMapItems}
            active={activeIndex}
            onPick={onActiveIndexChange}
            onAddQuestion={onAddQuestion}
            disabled={disabled}
          />

          {/* Canvas: stepper + pregunta en foco */}
          <div className="flex min-w-0 flex-col gap-3">
            <QuestionStepper
              items={stepperItems}
              active={activeIndex}
              onPick={onActiveIndexChange}
              onAdd={onAddQuestion}
              disabled={disabled}
            />

            {focused && (
              <QuestionCard
                key={`${focused.id}-${activeIndex}`}
                value={focused}
                index={activeIndex}
                totalCount={draft.preguntas.length}
                issues={issuesByQuestion.get(focused.id) ?? []}
                onChange={(next) => onQuestionChange(activeIndex, next)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `¿Eliminar la pregunta ${focused.id || `#${focused.numero}`}?`
                    )
                  ) {
                    onDeleteQuestion(activeIndex);
                  }
                }}
                onDuplicate={() => onDuplicateQuestion(activeIndex)}
                onMoveUp={() => onMoveQuestion(activeIndex, activeIndex - 1)}
                onMoveDown={() =>
                  onMoveQuestion(activeIndex, activeIndex + 1)
                }
                disabled={disabled}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modo código: textarea con JSON crudo
// ---------------------------------------------------------------------------

interface CodeModeProps {
  value: string;
  onChange: (next: string) => void;
  error: string | null;
  disabled: boolean;
}

function CodeMode({ value, onChange, error, disabled }: CodeModeProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">JSON canónico</CardTitle>
        <CardDescription className="text-xs">
          Modo avanzado: editás el JSON a mano. Al volver a "Tipado" se valida
          que el JSON sea parseable; si no, te avisamos sin cambiar de modo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          className="h-[480px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] opacity-90">
              {error}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Genera el próximo ID "P<n>" mirando los IDs existentes. Si el usuario usa
 * otros prefijos (S1, F2, etc.) los ignora y arranca a partir del mayor "P\d+".
 * Acepta un `avoid` opcional para no colisionar al duplicar.
 */
function nextQuestionId(q: Questionnaire, avoid?: string): string {
  const existing = new Set(q.preguntas.map((p) => p.id));
  if (avoid) existing.add(avoid);
  let maxN = 0;
  for (const id of existing) {
    const m = id.match(/^P(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  let n = maxN + 1;
  while (existing.has(`P${n}`)) n++;
  return `P${n}`;
}

/** Parsea el textarea del modo código. Validación de forma básica:
 *  metadata (objeto) + preguntas (array) + secciones (array). */
function parseCode(text: string): Questionnaire {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `JSON inválido: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("El JSON debe ser un objeto con metadata, preguntas y secciones.");
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.metadata || typeof obj.metadata !== "object") {
    throw new Error('Falta la clave "metadata" (objeto).');
  }
  if (!Array.isArray(obj.preguntas)) {
    throw new Error('Falta la clave "preguntas" (array).');
  }
  if (!Array.isArray(obj.secciones)) {
    throw new Error('Falta la clave "secciones" (array).');
  }
  return raw as Questionnaire;
}
