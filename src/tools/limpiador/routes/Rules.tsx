// Pantalla de reglas del Limpiador (paso 3).
//
// UX:
//   - Sugeridas: heurística determinística + IA coherencia (separadas
//     visualmente para que el costo de cada tipo sea claro).
//   - Reglas: lista unificada de guardadas + nuevas drafts. Las guardadas se
//     editan in-place; las nuevas viven con badge "Sin guardar" hasta que se
//     aprete el botón global "Guardar cambios (N)" (sticky arriba).
//   - Drafts persistidos en tauri-store por proyecto: lo que escribiste no se
//     pierde al volver al proyecto sin guardar.
//
// @mention:
//   - Dropdown autocompleta IDs de columna del último Excel.
//   - Navegación con ↑/↓ + Enter, Esc para cerrar.
//   - Inserta espacio post-@ID para no romper la mención al seguir tipeando.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getProject } from "@/lib/cleaning/projects-repository";
import {
  createRule,
  deleteRule,
  listRules,
  updateRule,
} from "@/lib/cleaning/rules-repository";
import {
  listVersions,
  updateVersionSchema,
} from "@/lib/cleaning/versions-repository";
import { suggestRules } from "@/lib/cleaning/suggest-rules";
import { applyQuestionnaireToVersionSchema } from "@/lib/cleaning/cuestionario-bridge";
import { findValidatedQuestionnaireByQpSurveyId } from "@/lib/cuestionario/questionnaire-repository";
import { getRuleDrafts, setRuleDrafts } from "@/lib/settings";
import type {
  CleaningRule,
  CleaningProject,
  CleaningVersion,
} from "@/lib/cleaning/types";
import type { CleaningRuleSuggestion } from "@/lib/cleaning/rule-suggestions";
import type {
  QuestionnaireRow,
  QuestionnaireValidationReport,
} from "@/lib/cuestionario/types";

export interface RulesProps {
  projectId: string;
  onBack: () => void;
  onGoToUpload: () => void;
}

interface QuestionOption {
  id: string;
  question: string;
}

type PendingSuggestion = CleaningRuleSuggestion & {
  accepted: boolean;
  key: string;
};

/**
 * Cambios pendientes a aplicar sobre una regla guardada. Si el set está
 * vacío para una regla, no hay diff con DB y se omite del save.
 */
interface PendingEdit {
  description?: string;
  isActive?: boolean;
}

/** Identifica qué input está enfocado para el dropdown de @mention. */
type ActiveInput =
  | { kind: "new"; index: number }
  | { kind: "edit"; ruleId: string };

export function Rules({ projectId, onBack, onGoToUpload }: RulesProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [rules, setRules] = useState<CleaningRule[]>([]);
  const [versions, setVersions] = useState<CleaningVersion[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<
    QuestionOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reglas manuales en edición (aún no persistidas en DB). Se autoguardan en
  // tauri-store con debounce para no perderlas al volver al proyecto.
  const [newRules, setNewRules] = useState<string[]>([]);

  // Cambios pendientes sobre reglas guardadas: description o is_active. Se
  // limpian al apretar "Guardar cambios" o al descartar la edición.
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(
    new Map()
  );

  // Edición in-place de una regla guardada: qué regla está editándose ahora.
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [savingAll, setSavingAll] = useState(false);

  // @mention state. `activeInput` distingue input de nueva regla vs. input de
  // edición in-place — ambos comparten dropdown.
  const [activeInput, setActiveInput] = useState<ActiveInput | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionPosition, setMentionPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    placement: "below" | "above";
  }>({ top: 0, left: 0, maxHeight: 320, placement: "below" });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const newInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  // Índice del último input recién agregado por "Nueva regla". Si no es null,
  // el useEffect que escucha `newRules.length` lo scrollea + enfoca.
  const pendingScrollIndexRef = useRef<number | null>(null);

  // Integración con el Validador de Cuestionarios (Iteración 6 del plan).
  const [questionnaireMatch, setQuestionnaireMatch] = useState<{
    questionnaire: QuestionnaireRow;
    validation: QuestionnaireValidationReport;
  } | null>(null);
  const [importingQuestionnaire, setImportingQuestionnaire] = useState(false);
  const [questionnaireImportInfo, setQuestionnaireImportInfo] = useState<
    string | null
  >(null);

  // Sugerencias.
  const [pendingSuggestions, setPendingSuggestions] = useState<
    PendingSuggestion[]
  >([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [savingSuggestions, setSavingSuggestions] = useState(false);

  // Cargar proyecto + reglas + versiones + drafts del store.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r, v, drafts] = await Promise.all([
        getProject(projectId),
        listRules(projectId),
        listVersions(projectId),
        getRuleDrafts(projectId),
      ]);
      setProject(p);
      setRules(r);
      setVersions(v);
      // Si hay drafts persistidos (lo que el usuario tipeó la última vez sin
      // guardar), los restauramos para que pueda retomar donde quedó.
      if (drafts.length > 0) {
        setNewRules(drafts);
      }
      if (v.length > 0) {
        const latest = v[0];
        setAvailableQuestions(
          latest.schema.columns.map((c) => ({
            id: c.id,
            question: c.question || c.id,
          }))
        );
      } else {
        setAvailableQuestions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Auto-persist drafts (debounce 400ms): el usuario tipea y, si no guarda, al
  // volver a la pantalla los recupera.
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      void setRuleDrafts(projectId, newRules);
    }, 400);
    return () => clearTimeout(timer);
  }, [newRules, projectId, loading]);

  // Buscar cuestionario validado por qp_survey_id.
  useEffect(() => {
    if (!project?.qp_survey_id) {
      setQuestionnaireMatch(null);
      return;
    }
    let cancelled = false;
    findValidatedQuestionnaireByQpSurveyId(project.qp_survey_id)
      .then((match) => {
        if (!cancelled) setQuestionnaireMatch(match);
      })
      .catch(() => {
        if (!cancelled) setQuestionnaireMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.qp_survey_id]);

  const hasNoVersions = versions.length === 0;

  const handleImportQuestionnaire = useCallback(async () => {
    if (!questionnaireMatch || versions.length === 0) return;
    const latest = versions[0];
    const qjson = questionnaireMatch.questionnaire.questionnaire_json;
    if (!qjson) {
      setQuestionnaireImportInfo(
        "El cuestionario validado no tiene JSON canónico (vacío)."
      );
      return;
    }
    setImportingQuestionnaire(true);
    setQuestionnaireImportInfo(null);
    try {
      const { schema, summary } = applyQuestionnaireToVersionSchema(
        qjson,
        latest.schema
      );
      await updateVersionSchema(latest.id, schema);
      setQuestionnaireImportInfo(
        `Importado: ${summary.matched}/${summary.totalQuestionColumns} columnas matcheadas` +
          (summary.unmatched > 0
            ? ` (${summary.unmatched} sin match — revisá los textos en el editor del cuestionario).`
            : ".")
      );
      await loadAll();
    } catch (err) {
      setQuestionnaireImportInfo(
        `No se pudo importar: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setImportingQuestionnaire(false);
    }
  }, [questionnaireMatch, versions, loadAll]);

  // --- contadores derivados ---

  const newRulesPendingCount = useMemo(
    () => newRules.filter((r) => r.trim().length > 0).length,
    [newRules]
  );

  const pendingChangesCount = newRulesPendingCount + pendingEdits.size;

  const totalVisibleRules = rules.length + newRules.length;

  // --- new rules (drafts en memoria + tauri-store) ---

  const handleAddRule = () => {
    setNewRules((prev) => {
      const next = [...prev, ""];
      // Marcamos el índice para que el effect que sigue scrollee + enfoque.
      pendingScrollIndexRef.current = next.length - 1;
      return next;
    });
  };

  // Cuando se agrega una nueva regla, llevamos la pantalla a ella y enfocamos
  // el input — evita que el usuario tenga que bajar manualmente para escribir.
  useEffect(() => {
    const idx = pendingScrollIndexRef.current;
    if (idx === null) return;
    pendingScrollIndexRef.current = null;
    // Doble rAF para asegurar que React ya pintó el nuevo input.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = newInputRefs.current[idx];
        if (!input) return;
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus({ preventScroll: true });
      });
    });
  }, [newRules.length]);

  const handleUpdateNewRule = (index: number, value: string) =>
    setNewRules((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

  const handleRemoveNewRule = (index: number) =>
    setNewRules((prev) => prev.filter((_, i) => i !== index));

  // --- edición in-place de reglas guardadas ---

  /** Entra en modo edición. Si ya había un draft de edit, lo retoma. */
  const startEditing = (rule: CleaningRule) => {
    setEditingRuleId(rule.id);
    setEditingText(
      pendingEdits.get(rule.id)?.description ?? rule.description ?? ""
    );
  };

  /** Confirma la edición — guarda en pendingEdits (no commit a DB todavía). */
  const confirmEditing = () => {
    if (!editingRuleId) return;
    const rule = rules.find((r) => r.id === editingRuleId);
    if (!rule) {
      setEditingRuleId(null);
      return;
    }
    const trimmed = editingText.trim();
    const original = (rule.description ?? "").trim();

    setPendingEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(editingRuleId) ?? {};
      if (trimmed === original) {
        // Sin diff con DB: removemos description del dirty (pero podemos
        // mantener isActive si tenía un toggle pendiente).
        const { description: _omit, ...rest } = existing;
        if (Object.keys(rest).length === 0) next.delete(editingRuleId);
        else next.set(editingRuleId, rest);
      } else {
        next.set(editingRuleId, { ...existing, description: trimmed });
      }
      return next;
    });
    setEditingRuleId(null);
    setEditingText("");
    setShowMentionDropdown(false);
  };

  const cancelEditing = () => {
    setEditingRuleId(null);
    setEditingText("");
    setShowMentionDropdown(false);
  };

  /** Toggle is_active de una regla guardada. Va a pendingEdits. */
  const toggleRuleActive = (rule: CleaningRule, newValue: boolean) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(rule.id) ?? {};
      if (newValue === rule.is_active) {
        const { isActive: _omit, ...rest } = existing;
        if (Object.keys(rest).length === 0) next.delete(rule.id);
        else next.set(rule.id, rest);
      } else {
        next.set(rule.id, { ...existing, isActive: newValue });
      }
      return next;
    });
  };

  /** Descarta todos los cambios pendientes de una regla guardada. */
  const discardPendingEdit = (ruleId: string) => {
    setPendingEdits((prev) => {
      if (!prev.has(ruleId)) return prev;
      const next = new Map(prev);
      next.delete(ruleId);
      return next;
    });
    if (editingRuleId === ruleId) cancelEditing();
  };

  /** Guarda TODO lo pendiente: edits + nuevas reglas. */
  const handleSaveAll = useCallback(async () => {
    if (pendingChangesCount === 0) return;
    setSavingAll(true);
    try {
      // 1) Edits a reglas guardadas
      for (const [ruleId, patch] of pendingEdits.entries()) {
        await updateRule(ruleId, patch);
      }
      // 2) Nuevas reglas (filtramos vacías)
      const toCreate = newRules.filter((r) => r.trim().length > 0);
      const baseOrder = rules.length;
      for (let i = 0; i < toCreate.length; i++) {
        await createRule({
          projectId,
          description: toCreate[i],
          orderIndex: baseOrder + i,
        });
      }
      setNewRules([]);
      setPendingEdits(new Map());
      await setRuleDrafts(projectId, null);
      await loadAll();
    } catch (err) {
      window.alert(
        `No se pudieron guardar los cambios: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setSavingAll(false);
    }
  }, [
    pendingChangesCount,
    pendingEdits,
    newRules,
    projectId,
    rules.length,
    loadAll,
  ]);

  // --- volver al proyecto: confirma si hay edits pendientes ---

  const handleBack = () => {
    if (pendingEdits.size > 0) {
      const ok = window.confirm(
        `Tenés ${pendingEdits.size} cambio${pendingEdits.size !== 1 ? "s" : ""} a reglas guardadas sin aplicar. ¿Salir igual? (Los drafts de reglas nuevas se mantienen.)`
      );
      if (!ok) return;
    }
    onBack();
  };

  // --- suggestions ---

  const handleGenerateSuggestions = useCallback(async () => {
    setSuggestLoading(true);
    setSuggestNote(null);
    setSuggestError(null);
    try {
      const result = await suggestRules(projectId);
      setPendingSuggestions(
        result.suggestions.map((s, i) => ({
          ...s,
          accepted: true,
          key: `${i}-${s.description.slice(0, 24)}`,
        }))
      );
      if (result.openaiSkipped && result.openaiSkipReason) {
        setSuggestNote(result.openaiSkipReason);
      }
    } catch (err) {
      setSuggestError(
        err instanceof Error ? err.message : "Error generando sugerencias"
      );
    } finally {
      setSuggestLoading(false);
    }
  }, [projectId]);

  const handleSaveAcceptedSuggestions = useCallback(async () => {
    const toSave = pendingSuggestions.filter((s) => s.accepted);
    if (toSave.length === 0) return;

    setSavingSuggestions(true);
    try {
      const baseOrder = rules.length;
      for (let i = 0; i < toSave.length; i++) {
        const s = toSave[i];
        await createRule({
          projectId,
          description: s.description,
          orderIndex: baseOrder + i,
          aiGenerated: true,
          aiReasoning: s.ai_reasoning || null,
        });
      }
      setPendingSuggestions([]);
      await loadAll();
    } catch (err) {
      window.alert(
        `No se pudieron guardar las sugerencias: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setSavingSuggestions(false);
    }
  }, [pendingSuggestions, projectId, rules.length, loadAll]);

  // --- @mention dropdown (compartido entre new rules y edit in-place) ---

  /**
   * Detecta si el cursor está justo después de un `@` sin espacios — si sí,
   * abre el dropdown con el filtro correspondiente. Se llama desde el
   * onChange de cualquier input (new o edit).
   */
  const detectMention = (
    value: string,
    inputElement: HTMLInputElement,
    target: ActiveInput
  ) => {
    const cursorPos = inputElement.selectionStart ?? 0;
    setCursorPosition(cursorPos);

    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(" ")) {
        setActiveInput(target);
        setMentionFilter(textAfterAt.toLowerCase());
        setShowMentionDropdown(true);
        setMentionPosition(computeMentionPosition(inputElement));
        setMentionHighlightIndex(0);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const handleNewInputChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    handleUpdateNewRule(index, e.target.value);
    detectMention(e.target.value, e.target, { kind: "new", index });
  };

  const handleEditInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!editingRuleId) return;
    setEditingText(e.target.value);
    detectMention(e.target.value, e.target, {
      kind: "edit",
      ruleId: editingRuleId,
    });
  };

  const filteredQuestions = useMemo(
    () =>
      availableQuestions
        .filter(
          (q) =>
            q.id.toLowerCase().includes(mentionFilter) ||
            q.question.toLowerCase().includes(mentionFilter)
        )
        .slice(0, 50),
    [availableQuestions, mentionFilter]
  );

  /**
   * Inserta `@ID ` (con espacio) en el input activo. El espacio evita que la
   * mención se rompa si el usuario sigue escribiendo pegado.
   */
  const handleSelectMention = (questionId: string) => {
    if (!activeInput) return;

    let currentValue: string;
    let inputEl: HTMLInputElement | null;

    if (activeInput.kind === "new") {
      currentValue = newRules[activeInput.index] ?? "";
      inputEl = newInputRefs.current[activeInput.index];
    } else {
      currentValue = editingText;
      inputEl = editInputRef.current;
    }

    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const textAfterCursor = currentValue.substring(cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textBeforeAt = currentValue.substring(0, lastAtIndex);

    // Auto-espacio: si lo que sigue al cursor no empieza con espacio, agregamos.
    const needsSpace = !textAfterCursor.startsWith(" ");
    const insertion = `@${questionId}${needsSpace ? " " : ""}`;
    const newValue = `${textBeforeAt}${insertion}${textAfterCursor}`;

    if (activeInput.kind === "new") {
      handleUpdateNewRule(activeInput.index, newValue);
    } else {
      setEditingText(newValue);
    }

    setShowMentionDropdown(false);
    setActiveInput(null);

    if (inputEl) {
      const newCursorPos = textBeforeAt.length + insertion.length;
      inputEl.focus();
      setTimeout(() => {
        inputEl?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  /** Arrow keys + Enter + Esc en el dropdown. */
  const handleMentionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowMentionDropdown(false);
      return;
    }
    if (!showMentionDropdown || filteredQuestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionHighlightIndex((i) =>
        Math.min(i + 1, filteredQuestions.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = filteredQuestions[mentionHighlightIndex];
      if (q) handleSelectMention(q.id);
    }
  };

  // --- delete ---

  const handleDeleteRule = useCallback(
    async (rule: CleaningRule) => {
      const confirmed = window.confirm(
        `¿Eliminar la regla "${(rule.description ?? "").slice(0, 80)}"?`
      );
      if (!confirmed) return;
      try {
        await deleteRule(rule.id);
        // Optimistic update: removemos la regla del array local en vez de
        // re-fetchear. `loadAll()` setearía `loading=true` y haría que React
        // re-renderice el "Cargando reglas…", lo que pierde el scroll y se
        // siente tosco.
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
        // Limpiar cualquier estado in-flight asociado a la regla borrada.
        discardPendingEdit(rule.id);
      } catch (err) {
        window.alert(
          `No se pudo eliminar: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    []
  );

  // --- render ---

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando reglas…
      </div>
    );
  }

  if (error || !project) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">No se pudo cargar el proyecto</span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {error || "Proyecto no encontrado"}
          </pre>
          <div>
            <Button size="sm" onClick={onBack}>
              Volver
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Particionado de sugerencias por origen — la heurística es gratis, la IA
  // consume crédito de OpenAI: mostramos ambas en sub-grupos distintos.
  const heuristicSuggestions = pendingSuggestions.filter(
    (s) => s.source !== "openai"
  );
  const aiSuggestions = pendingSuggestions.filter(
    (s) => s.source === "openai"
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al proyecto
        </Button>
      </div>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Filter className="size-5" />
          Reglas de limpieza
        </h2>
        <p className="text-sm text-muted-foreground">
          Proyecto: {project.name}
        </p>
      </div>

      {/* Sin versiones: aviso */}
      {hasNoVersions && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-amber-300">
                Subí un archivo primero
              </p>
              <p className="text-sm text-muted-foreground">
                Para usar @ y referenciar preguntas, primero subí un Excel.
                Las preguntas se extraen automáticamente del schema.
              </p>
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={onGoToUpload}>
                  Subir archivo Excel →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cuestionario validado (atajo Iteración 6). */}
      {!hasNoVersions && questionnaireMatch && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-300">
              <ClipboardCheck className="size-4" />
              Cuestionario validado disponible
            </CardTitle>
            <Button
              size="sm"
              onClick={() => void handleImportQuestionnaire()}
              disabled={importingQuestionnaire}
              className="gap-2"
            >
              {importingQuestionnaire ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Importar cuestionario validado
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Existe un cuestionario canónico validado para esta encuesta:{" "}
              <span className="font-medium">
                {questionnaireMatch.questionnaire.nombre}
              </span>{" "}
              <span className="text-muted-foreground">
                ({questionnaireMatch.validation.resumen.errors} errores,{" "}
                {questionnaireMatch.validation.resumen.advertencias} advertencias,{" "}
                {questionnaireMatch.validation.resumen.sugerencias} sugerencias).
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Al importar se enriquecen los tipos + opciones de las columnas del
              último Excel, lo que hace que las sugerencias automáticas sean más
              precisas. La operación es idempotente.
            </p>
            {questionnaireMatch.validation.resumen.errors > 0 && (
              <p className="text-xs text-amber-300">
                Ojo: el cuestionario todavía tiene errores pendientes. Conviene
                resolverlos en el Validador antes de importar.
              </p>
            )}
            {questionnaireImportInfo && (
              <p className="rounded-md border bg-background px-3 py-2 text-xs">
                {questionnaireImportInfo}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sugeridas */}
      {!hasNoVersions && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-primary" />
              Sugeridas
            </CardTitle>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleGenerateSuggestions()}
              disabled={suggestLoading}
              className="gap-2"
            >
              {suggestLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Generar sugerencias
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Usa el último Excel subido para proponer reglas automáticamente.
              Hay dos tipos: <span className="font-medium">por tipo de pregunta</span>{" "}
              (gratis, instantáneas) y{" "}
              <span className="font-medium">coherencia entre preguntas</span>{" "}
              (usa OpenAI, consume crédito).
            </p>

            {suggestError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {suggestError}
              </div>
            )}
            {suggestNote && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
                {suggestNote}
              </div>
            )}

            {pendingSuggestions.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                Todavía no hay sugerencias en cola. Pulsá "Generar sugerencias".
              </p>
            ) : (
              <>
                <div className="flex max-h-[480px] flex-col gap-4 overflow-y-auto pr-1">
                  {heuristicSuggestions.length > 0 && (
                    <SuggestionGroup
                      title="Por tipo de pregunta"
                      subtitle="Gratis · generadas a partir del schema del Excel"
                      icon={Filter}
                      tone="muted"
                      suggestions={heuristicSuggestions}
                      questions={availableQuestions}
                      onToggle={(key, checked) =>
                        setPendingSuggestions((prev) =>
                          prev.map((x) =>
                            x.key === key ? { ...x, accepted: checked } : x
                          )
                        )
                      }
                    />
                  )}

                  {aiSuggestions.length > 0 && (
                    <SuggestionGroup
                      title="Coherencia entre preguntas"
                      subtitle="Usa OpenAI · consume crédito de tu API key"
                      icon={Sparkles}
                      tone="ai"
                      suggestions={aiSuggestions}
                      questions={availableQuestions}
                      onToggle={(key, checked) =>
                        setPendingSuggestions((prev) =>
                          prev.map((x) =>
                            x.key === key ? { ...x, accepted: checked } : x
                          )
                        )
                      }
                    />
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingSuggestions([])}
                    disabled={savingSuggestions}
                  >
                    Descartar todas
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveAcceptedSuggestions()}
                    disabled={
                      savingSuggestions ||
                      pendingSuggestions.every((s) => !s.accepted)
                    }
                    className="gap-2"
                  >
                    {savingSuggestions ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        Aceptar y agregar (
                        {pendingSuggestions.filter((s) => s.accepted).length})
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sticky save bar — sólo visible si hay cambios pendientes. */}
      {pendingChangesCount > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm text-muted-foreground">
            Tenés <span className="font-semibold text-foreground">{pendingChangesCount}</span>{" "}
            cambio{pendingChangesCount !== 1 ? "s" : ""} sin guardar
            {pendingEdits.size > 0 && newRulesPendingCount > 0
              ? ` (${pendingEdits.size} edición${pendingEdits.size !== 1 ? "es" : ""} + ${newRulesPendingCount} nueva${newRulesPendingCount !== 1 ? "s" : ""})`
              : pendingEdits.size > 0
                ? ` (edición${pendingEdits.size !== 1 ? "es" : ""} sobre guardadas)`
                : ` (regla${newRulesPendingCount !== 1 ? "s" : ""} nueva${newRulesPendingCount !== 1 ? "s" : ""})`}
          </span>
          <Button
            onClick={() => void handleSaveAll()}
            disabled={savingAll}
            className="gap-2"
          >
            {savingAll ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Save className="size-4" />
                Guardar cambios ({pendingChangesCount})
              </>
            )}
          </Button>
        </div>
      )}

      {/* Lista unificada de reglas (guardadas + nuevas drafts). */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Reglas ({totalVisibleRules})
          </CardTitle>
          <Button
            onClick={handleAddRule}
            size="sm"
            variant="outline"
            className="gap-1"
          >
            <Plus className="size-4" />
            Nueva regla
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {totalVisibleRules === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Filter className="size-8 opacity-50" />
              <p>Todavía no hay reglas para este proyecto.</p>
              <p className="text-xs">
                Empezá generando sugerencias arriba o agregando una a mano.
              </p>
              <Button
                onClick={handleAddRule}
                variant="outline"
                size="sm"
                className="mt-2 gap-1"
              >
                <Plus className="size-4" />
                Agregar primera regla
              </Button>
            </div>
          ) : (
            <>
              {rules.map((rule, index) => {
                const pending = pendingEdits.get(rule.id);
                const effectiveDescription =
                  pending?.description ?? rule.description ?? "";
                const effectiveActive = pending?.isActive ?? rule.is_active;
                const isEditing = editingRuleId === rule.id;
                const isDirty = !!pending;

                return (
                  <SavedRuleRow
                    key={rule.id}
                    rule={rule}
                    index={index}
                    isEditing={isEditing}
                    editingText={editingText}
                    effectiveDescription={effectiveDescription}
                    effectiveActive={effectiveActive}
                    isDirty={isDirty}
                    questions={availableQuestions}
                    editInputRef={editInputRef}
                    onStartEdit={() => startEditing(rule)}
                    onConfirmEdit={confirmEditing}
                    onCancelEdit={cancelEditing}
                    onEditChange={handleEditInputChange}
                    onMentionKeyDown={handleMentionKeyDown}
                    onToggleActive={(v) => toggleRuleActive(rule, v)}
                    onDiscardPending={() => discardPendingEdit(rule.id)}
                    onDelete={() => void handleDeleteRule(rule)}
                  />
                );
              })}

              {newRules.map((ruleText, index) => (
                <NewRuleRow
                  key={`new-${index}`}
                  index={index}
                  numberLabel={rules.length + index + 1}
                  text={ruleText}
                  questions={availableQuestions}
                  inputRef={(el) => {
                    newInputRefs.current[index] = el;
                  }}
                  onChange={(e) => handleNewInputChange(index, e)}
                  onMentionKeyDown={handleMentionKeyDown}
                  onRemove={() => handleRemoveNewRule(index)}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* @mention dropdown — flotante. */}
      {showMentionDropdown && filteredQuestions.length > 0 && (
        <div
          className="fixed z-50 flex w-[500px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
          style={{
            top: mentionPosition.top,
            left: mentionPosition.left,
            maxHeight: mentionPosition.maxHeight,
          }}
        >
          <div className="shrink-0 border-b bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            {filteredQuestions.length} pregunta
            {filteredQuestions.length !== 1 ? "s" : ""} · usá ↑↓ para navegar,
            Enter para elegir, Esc para cerrar
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredQuestions.map((q, i) => {
              const highlighted = i === mentionHighlightIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setMentionHighlightIndex(i)}
                  onClick={() => handleSelectMention(q.id)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0",
                    highlighted ? "bg-accent" : "hover:bg-accent"
                  )}
                >
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                    {q.id}
                  </span>
                  <span className="line-clamp-2 text-muted-foreground">
                    {q.question !== q.id
                      ? q.question
                      : "(sin texto de pregunta)"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Help */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Cómo escribir reglas</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li>• Escribí en lenguaje natural qué querés detectar.</li>
              <li>
                • Usá <code className="rounded bg-muted px-1">@</code> para
                referenciar preguntas (navegá con ↑↓, Enter elige).
              </li>
              <li>
                • Ejemplo:{" "}
                <em>"Excluir si @Q5 tiene más de 500 caracteres"</em>.
              </li>
              <li>
                • Ejemplo:{" "}
                <em>
                  "Marcar respuestas que parezcan generadas por IA en @Q12"
                </em>
                .
              </li>
              <li>
                • Ejemplo:{" "}
                <em>"Eliminar si @EDAD &gt; 65 y @DURACION &lt; 30s"</em>.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Calcula la posición y maxHeight del dropdown de @mention para que entre en
 * el viewport. Prefiere abajo del input; flipea arriba si abajo no entra cómodo
 * (umbral mínimo de 160px). Cap'ea `maxHeight` al espacio disponible para que
 * nunca se salga del viewport.
 *
 * Usa coords del viewport (sin `window.scrollY/X`) porque el dropdown está
 * `position: fixed`.
 */
function computeMentionPosition(input: HTMLInputElement): {
  top: number;
  left: number;
  maxHeight: number;
  placement: "below" | "above";
} {
  const rect = input.getBoundingClientRect();
  const GAP = 4;
  const VIEWPORT_PADDING = 8;
  const PREFERRED_MAX = 320;
  const MIN_BELOW = 160;

  const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_PADDING;
  const spaceAbove = rect.top - GAP - VIEWPORT_PADDING;

  const placeBelow = spaceBelow >= MIN_BELOW || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    120,
    Math.min(PREFERRED_MAX, placeBelow ? spaceBelow : spaceAbove)
  );

  const top = placeBelow
    ? rect.bottom + GAP
    : Math.max(VIEWPORT_PADDING, rect.top - GAP - maxHeight);

  return {
    top,
    left: rect.left,
    maxHeight,
    placement: placeBelow ? "below" : "above",
  };
}

// --- Subcomponentes ---------------------------------------------------------

interface SavedRuleRowProps {
  rule: CleaningRule;
  index: number;
  isEditing: boolean;
  editingText: string;
  effectiveDescription: string;
  effectiveActive: boolean;
  isDirty: boolean;
  questions: QuestionOption[];
  editInputRef: RefObject<HTMLInputElement | null>;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onMentionKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onToggleActive: (v: boolean) => void;
  onDiscardPending: () => void;
  onDelete: () => void;
}

/**
 * Fila de una regla guardada. Soporta edición in-place (Input + Check/X) y
 * toggle is_active. Si hay cambios pendientes sin guardar, muestra badge
 * "Sin guardar" + opción de descartar.
 */
function SavedRuleRow({
  rule,
  index,
  isEditing,
  editingText,
  effectiveDescription,
  effectiveActive,
  isDirty,
  questions,
  editInputRef,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onEditChange,
  onMentionKeyDown,
  onToggleActive,
  onDiscardPending,
  onDelete,
}: SavedRuleRowProps) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-md border bg-muted/20 p-3 transition-colors",
        isDirty && "border-primary/50 bg-primary/5",
        !effectiveActive && "opacity-60"
      )}
    >
      <span className="mt-0.5 shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {rule.ai_generated && (
            <Badge variant="outline" className="text-xs">
              Sugerida
            </Badge>
          )}
          {isDirty && (
            <Badge
              variant="outline"
              className="border-primary/60 text-xs text-primary"
            >
              ● Sin guardar
            </Badge>
          )}
          {!effectiveActive && (
            <Badge variant="secondary" className="text-xs">
              Inactiva
            </Badge>
          )}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              ref={editInputRef}
              value={editingText}
              onChange={onEditChange}
              onKeyDown={(e) => {
                onMentionKeyDown(e);
                if (e.key === "Enter" && !e.defaultPrevented) {
                  // Si el dropdown no se llevó el Enter, lo usamos para confirmar.
                  e.preventDefault();
                  onConfirmEdit();
                }
              }}
              autoFocus
              className="font-mono text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={onConfirmEdit}
              aria-label="Confirmar edición"
              className="shrink-0 text-primary"
            >
              <Check className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onCancelEdit}
              aria-label="Cancelar edición"
              className="shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <RulePreview text={effectiveDescription} questions={questions} />
        )}

        {rule.ai_reasoning && !isEditing && (
          <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
            {rule.ai_reasoning}
          </p>
        )}

        {isDirty && (
          <button
            type="button"
            onClick={onDiscardPending}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Descartar cambios
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className="flex items-center gap-1.5"
          title={effectiveActive ? "Activa" : "Inactiva — el motor la ignora"}
        >
          <Switch
            checked={effectiveActive}
            onCheckedChange={onToggleActive}
            aria-label="Activa o inactiva"
          />
        </div>
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Acciones de la regla"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onStartEdit} className="gap-2">
                <Pencil className="size-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

interface NewRuleRowProps {
  index: number;
  numberLabel: number;
  text: string;
  questions: QuestionOption[];
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onMentionKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

/**
 * Fila de una regla nueva (no guardada). Siempre editable, con badge
 * "Sin guardar".
 */
function NewRuleRow({
  numberLabel,
  text,
  questions,
  inputRef,
  onChange,
  onMentionKeyDown,
  onRemove,
}: NewRuleRowProps) {
  return (
    <div className="group flex items-start gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
      <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
        {numberLabel}
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <Badge
          variant="outline"
          className="border-primary/60 text-xs text-primary"
        >
          ● Sin guardar
        </Badge>

        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={onChange}
            onKeyDown={onMentionKeyDown}
            placeholder={
              questions.length > 0
                ? "Escribí la regla… usá @ para referenciar preguntas"
                : "Escribí la regla en lenguaje natural…"
            }
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Quitar regla"
            className="shrink-0"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>

        {text.includes("@") && questions.length > 0 && (
          <div className="border-l-2 border-primary/30 pl-2">
            <RulePreview text={text} questions={questions} />
          </div>
        )}
      </div>
    </div>
  );
}

interface SuggestionGroupProps {
  title: string;
  subtitle: string;
  icon: typeof Filter;
  tone: "muted" | "ai";
  suggestions: PendingSuggestion[];
  questions: QuestionOption[];
  onToggle: (key: string, checked: boolean) => void;
}

/**
 * Agrupa sugerencias por origen (heurística vs IA). El header del grupo deja
 * en claro qué cuesta plata y qué no.
 */
function SuggestionGroup({
  title,
  subtitle,
  icon: Icon,
  tone,
  suggestions,
  questions,
  onToggle,
}: SuggestionGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2",
          tone === "ai"
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-muted bg-muted/30"
        )}
      >
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "ai" ? "text-amber-400" : "text-muted-foreground"
          )}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {title}{" "}
            <span className="text-xs text-muted-foreground">
              ({suggestions.length})
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <SuggestionRow
            key={s.key}
            suggestion={s}
            questions={questions}
            onToggle={(checked) => onToggle(s.key, checked)}
          />
        ))}
      </div>
    </div>
  );
}

interface SuggestionRowProps {
  suggestion: PendingSuggestion;
  questions: QuestionOption[];
  onToggle: (checked: boolean) => void;
}

function SuggestionRow({
  suggestion,
  questions,
  onToggle,
}: SuggestionRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-start">
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-center sm:pt-1">
        <Switch
          id={`acc-${suggestion.key}`}
          checked={suggestion.accepted}
          onCheckedChange={onToggle}
        />
        <Label
          htmlFor={`acc-${suggestion.key}`}
          className="cursor-pointer text-xs text-muted-foreground sm:text-center"
        >
          {suggestion.accepted ? "Incluir" : "No"}
        </Label>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <RulePreview text={suggestion.description} questions={questions} />
        {suggestion.ai_reasoning && (
          <p className="border-l-2 border-muted-foreground/40 pl-2 text-xs text-muted-foreground">
            {suggestion.ai_reasoning}
          </p>
        )}
      </div>
    </div>
  );
}

interface RulePreviewProps {
  text: string;
  questions: QuestionOption[];
}

/**
 * Renderiza el texto de una regla con `@mentions` resaltados (chip + tooltip
 * con el texto de la pregunta).
 */
function RulePreview({ text, questions }: RulePreviewProps) {
  if (!text.trim()) return null;

  const parts: Array<{
    type: "text" | "mention";
    content: string;
    question?: string;
  }> = [];
  const regex = /@(\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    const mentionId = match[1];
    const found = questions.find(
      (q) => q.id.toLowerCase() === mentionId.toLowerCase()
    );
    parts.push({
      type: "mention",
      content: mentionId,
      question: found?.question || mentionId,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (parts.every((p) => p.type === "text")) {
    return <span className="text-sm leading-relaxed">{text}</span>;
  }

  return (
    <div className="text-sm leading-relaxed">
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={i}
            className={cn(
              "mx-0.5 inline-flex cursor-help items-center rounded px-1.5 py-0.5",
              "bg-primary/15 font-mono text-xs font-medium text-primary",
              "hover:bg-primary/25"
            )}
            title={`📋 ${part.question}`}
          >
            @{part.content}
          </span>
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </div>
  );
}
