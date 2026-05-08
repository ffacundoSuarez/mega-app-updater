// Pantalla de reglas del Limpiador (paso 3).
//
// Estructura (port de mega-dashboard/src/app/(dashboard)/limpiador/[projectId]/rules/page.tsx):
//   - Sugeridas: heurística determinística + IA coherencia. El usuario las
//     acepta o rechaza con un switch antes de persistirlas.
//   - Reglas guardadas: lista de las reglas ya en DB (con badge "Sugerida"
//     si vinieron de IA y razonamiento), botón eliminar.
//   - Manuales: editor con `@mention` que autocompleta IDs de columna del
//     último Excel cargado.
//
// Diferencias con mega-dashboard:
//   - Sin Next/Link: callbacks (`onBack`, `onGoToUpload`).
//   - `suggest-rules` es una función TS local, no un endpoint HTTP.
//   - OpenAI key se lee de Ajustes (manejado dentro de `suggestRules`).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Filter,
  GripVertical,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getProject } from "@/lib/cleaning/projects-repository";
import {
  createRule,
  deleteRule,
  listRules,
} from "@/lib/cleaning/rules-repository";
import { listVersions } from "@/lib/cleaning/versions-repository";
import { suggestRules } from "@/lib/cleaning/suggest-rules";
import type {
  CleaningRule,
  CleaningProject,
  CleaningVersion,
} from "@/lib/cleaning/types";
import type { CleaningRuleSuggestion } from "@/lib/cleaning/rule-suggestions";

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

export function Rules({ projectId, onBack, onGoToUpload }: RulesProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [rules, setRules] = useState<CleaningRule[]>([]);
  const [versions, setVersions] = useState<CleaningVersion[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<
    QuestionOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reglas manuales en edición (aún no persistidas).
  const [newRules, setNewRules] = useState<string[]>([]);
  const [savingManual, setSavingManual] = useState(false);

  // @mention state (compartido entre todos los inputs)
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Sugerencias.
  const [pendingSuggestions, setPendingSuggestions] = useState<
    PendingSuggestion[]
  >([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [savingSuggestions, setSavingSuggestions] = useState(false);

  // Cargar proyecto + reglas + versiones.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r, v] = await Promise.all([
        getProject(projectId),
        listRules(projectId),
        listVersions(projectId),
      ]);
      setProject(p);
      setRules(r);
      setVersions(v);
      if (v.length > 0) {
        const latest = v[0]; // listVersions devuelve más nueva primero
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

  const hasNoVersions = versions.length === 0;

  // --- manual rules ---

  const handleAddRule = () => setNewRules((prev) => [...prev, ""]);

  const handleUpdateNewRule = (index: number, value: string) =>
    setNewRules((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

  const handleRemoveNewRule = (index: number) =>
    setNewRules((prev) => prev.filter((_, i) => i !== index));

  const handleSaveNewRules = useCallback(async () => {
    const toSave = newRules.filter((r) => r.trim().length > 0);
    if (toSave.length === 0) return;

    setSavingManual(true);
    try {
      for (let i = 0; i < toSave.length; i++) {
        await createRule({
          projectId,
          description: toSave[i],
          orderIndex: rules.length + i,
        });
      }
      setNewRules([]);
      await loadAll();
    } catch (err) {
      window.alert(
        `No se pudieron guardar las reglas: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setSavingManual(false);
    }
  }, [newRules, projectId, rules.length, loadAll]);

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

  // --- @mention dropdown ---

  const handleInputChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    const inputElement = e.target;
    handleUpdateNewRule(index, value);

    const cursorPos = inputElement.selectionStart ?? 0;
    setCursorPosition(cursorPos);

    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(" ")) {
        setActiveInputIndex(index);
        setMentionFilter(textAfterAt.toLowerCase());
        setShowMentionDropdown(true);
        const rect = inputElement.getBoundingClientRect();
        setMentionPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
        });
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const handleSelectMention = (questionId: string) => {
    if (activeInputIndex === null) return;

    const currentValue = newRules[activeInputIndex];
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const textAfterCursor = currentValue.substring(cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textBeforeAt = textBeforeCursor.substring(0, lastAtIndex);

    const newValue = `${textBeforeAt}@${questionId}${textAfterCursor}`;
    handleUpdateNewRule(activeInputIndex, newValue);
    setShowMentionDropdown(false);

    // Restaurar foco y posición del cursor.
    const input = inputRefs.current[activeInputIndex];
    if (input) {
      input.focus();
      const newCursorPos = textBeforeAt.length + 1 + questionId.length;
      setTimeout(() => {
        input.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
    setActiveInputIndex(null);
  };

  const filteredQuestions = availableQuestions
    .filter(
      (q) =>
        q.id.toLowerCase().includes(mentionFilter) ||
        q.question.toLowerCase().includes(mentionFilter)
    )
    .slice(0, 50);

  // --- delete ---

  const handleDeleteRule = useCallback(
    async (rule: CleaningRule) => {
      const confirmed = window.confirm(
        `¿Eliminar la regla "${(rule.description ?? "").slice(0, 80)}"?`
      );
      if (!confirmed) return;
      try {
        await deleteRule(rule.id);
        await loadAll();
      } catch (err) {
        window.alert(
          `No se pudo eliminar: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [loadAll]
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
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

      {/* Sugeridas */}
      {!hasNoVersions && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-primary" />
              Sugeridas (tipo + coherencia)
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
              Usa el último Excel subido: reglas automáticas por tipo de
              pregunta y hasta cinco reglas de coherencia entre preguntas (si
              hay <code className="rounded bg-muted px-1">OpenAI key</code> en
              Ajustes).
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
                <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                  {pendingSuggestions.map((s) => (
                    <SuggestionRow
                      key={s.key}
                      suggestion={s}
                      questions={availableQuestions}
                      onToggle={(checked) =>
                        setPendingSuggestions((prev) =>
                          prev.map((x) =>
                            x.key === s.key
                              ? { ...x, accepted: checked }
                              : x
                          )
                        )
                      }
                    />
                  ))}
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
                        Guardar aceptadas (
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

      {/* Reglas guardadas */}
      {rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Reglas guardadas ({rules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className="group flex items-start gap-3 rounded-md border bg-muted/20 p-3"
              >
                <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <span className="mt-0.5 shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.ai_generated && (
                      <Badge variant="outline" className="text-xs">
                        Sugerida
                      </Badge>
                    )}
                  </div>
                  <RulePreview
                    text={rule.description ?? ""}
                    questions={availableQuestions}
                  />
                  {rule.ai_reasoning && (
                    <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
                      {rule.ai_reasoning}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDeleteRule(rule)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Eliminar regla"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Reglas manuales */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Reglas manuales</CardTitle>
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
        <CardContent className="flex flex-col gap-3">
          {newRules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Filter className="size-8 opacity-50" />
              <p>No hay reglas nuevas.</p>
              <Button onClick={handleAddRule} variant="outline" size="sm">
                <Plus className="mr-1 size-4" />
                Agregar primera regla
              </Button>
            </div>
          ) : (
            <>
              {newRules.map((ruleText, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                      {rules.length + index + 1}
                    </span>
                    <Input
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      value={ruleText}
                      onChange={(e) => handleInputChange(index, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setShowMentionDropdown(false);
                      }}
                      onBlur={() => {
                        // Delay para permitir el click en el dropdown.
                        setTimeout(() => setShowMentionDropdown(false), 200);
                      }}
                      placeholder={
                        availableQuestions.length > 0
                          ? "Escribí la regla… usá @ para referenciar preguntas"
                          : "Escribí la regla en lenguaje natural…"
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveNewRule(index)}
                      aria-label="Quitar regla"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  {ruleText.includes("@") && availableQuestions.length > 0 && (
                    <div className="ml-9 border-l-2 border-primary/30 pl-2">
                      <RulePreview
                        text={ruleText}
                        questions={availableQuestions}
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between border-t pt-3">
                <Button onClick={handleAddRule} variant="ghost" size="sm">
                  <Plus className="mr-1 size-4" />
                  Otra regla
                </Button>
                <Button
                  onClick={() => void handleSaveNewRules()}
                  disabled={
                    savingManual || newRules.every((r) => !r.trim())
                  }
                  className="gap-2"
                >
                  {savingManual ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      Guardar reglas
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* @mention dropdown — flotante */}
      {showMentionDropdown && filteredQuestions.length > 0 && (
        <div
          className="fixed z-50 max-h-80 w-[500px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
          style={{ top: mentionPosition.top, left: mentionPosition.left }}
        >
          <div className="sticky top-0 border-b bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            {filteredQuestions.length} pregunta
            {filteredQuestions.length !== 1 ? "s" : ""} encontrada
            {filteredQuestions.length !== 1 ? "s" : ""}
          </div>
          {filteredQuestions.map((q) => (
            <button
              key={q.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // evita perder focus del input
              onClick={() => handleSelectMention(q.id)}
              className="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
            >
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                {q.id}
              </span>
              <span className="line-clamp-2 text-muted-foreground">
                {q.question !== q.id ? q.question : "(sin texto de pregunta)"}
              </span>
            </button>
          ))}
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
                referenciar preguntas específicas.
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

// --- Subcomponentes ---------------------------------------------------------

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
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={suggestion.source === "openai" ? "default" : "secondary"}
            className="text-xs"
          >
            {suggestion.source === "openai" ? "Coherencia (IA)" : "Por tipo"}
          </Badge>
        </div>
        <RulePreview text={suggestion.description} questions={questions} />
        <p className="border-l-2 border-muted-foreground/40 pl-2 text-xs text-muted-foreground">
          {suggestion.ai_reasoning}
        </p>
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
