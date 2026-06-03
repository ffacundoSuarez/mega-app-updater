import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  PartyPopper,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getCategoriesByJob } from "@/lib/codificacion/categories-repository";
import { getJob } from "@/lib/codificacion/jobs-repository";
import { preclassifySamples } from "@/lib/codificacion/preclassify-samples";
import {
  generateSampleResponses,
  getSampleClassifications,
  saveSampleClassifications,
} from "@/lib/codificacion/samples-repository";
import { getDisplayCategoryId } from "@/lib/codificacion/category-display";
import type { Category, ResponseRow } from "@/lib/codificacion/types";
import { getOpenaiApiKey } from "@/lib/settings";

interface SampleRow {
  response: ResponseRow;
  suggested: number[];
  confidence: number[];
  selected: number[];
  done: boolean;
}

interface PickCategory {
  category_id: number;
  name: string;
}

export interface SampleTrainingProps {
  jobId: string;
  onBack: () => void;
  onComplete: () => void;
}

export function SampleTraining({ jobId, onBack, onComplete }: SampleTrainingProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [question, setQuestion] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const job = await getJob(jobId);
      if (!job) throw new Error("Encuesta no encontrada");
      setQuestion(job.question);

      const cats = await getCategoriesByJob(jobId);
      setCategories(cats);

      const existing = await getSampleClassifications(jobId);
      if (existing.length > 0) {
        setAlreadyDone(job.sample_training_completed);
        setSamples(
          existing.map((s) => ({
            response: {
              id: s.response_id,
              job_id: jobId,
              response_id: s.response_id,
              response_text: s.response_text,
              created_at: s.created_at,
            },
            suggested: s.ai_suggested_categories ?? s.user_corrected_categories,
            confidence: s.ai_confidence_scores ?? [],
            selected: s.user_corrected_categories,
            done: true,
          }))
        );
        return;
      }

      const apiKey = await getOpenaiApiKey();
      if (!apiKey) throw new Error("Falta OpenAI API key en Ajustes");

      const rawSamples = await generateSampleResponses(jobId);
      const preclassified = await preclassifySamples(
        apiKey,
        rawSamples,
        cats,
        job.question
      );

      setSamples(
        preclassified.map((p) => ({
          response: p.response,
          suggested: p.suggestedCategories,
          confidence: p.confidence,
          selected: [...p.suggestedCategories],
          done: false,
        }))
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

  const allCategories: PickCategory[] = useMemo(
    () => [
      ...categories.map((c) => ({ category_id: c.category_id, name: c.name })),
      { category_id: 998, name: "Sin respuesta" },
      { category_id: 999, name: "Otro" },
    ],
    [categories]
  );

  const categoryName = useCallback(
    (id: number) =>
      allCategories.find((c) => c.category_id === id)?.name ?? `Categoría ${id}`,
    [allCategories]
  );

  const total = samples.length;
  const doneCount = samples.filter((s) => s.done).length;
  const allDone = total > 0 && doneCount === total;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;

  const updateSample = (index: number, patch: Partial<SampleRow>) =>
    setSamples((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );

  const toggleCategory = (index: number, catId: number) => {
    setSamples((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const has = s.selected.includes(catId);
        const next = has
          ? s.selected.filter((id) => id !== catId)
          : [...s.selected, catId];
        return { ...s, selected: next.length ? next : [catId], done: true };
      })
    );
  };

  const goTo = (index: number) =>
    setCurrentIndex(Math.max(0, Math.min(index, total - 1)));

  const acceptSuggestion = (index: number) => {
    updateSample(index, {
      selected: [...samples[index].suggested],
      done: true,
    });
    if (index < total - 1) goTo(index + 1);
  };

  const nextSample = (index: number) => {
    if (samples[index].selected.length > 0) updateSample(index, { done: true });
    if (index < total - 1) goTo(index + 1);
  };

  const acceptAllRemaining = () => {
    setSamples((prev) =>
      prev.map((s) =>
        s.done ? s : { ...s, selected: [...s.suggested], done: true }
      )
    );
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const apiKey = await getOpenaiApiKey();
      if (!apiKey) throw new Error("Falta OpenAI API key en Ajustes");
      const excludeIds = samples.map((s) => s.response.id);
      const rawSamples = await generateSampleResponses(jobId, 15, excludeIds);
      if (rawSamples.length === 0) {
        toast.info("No quedan más respuestas distintas para muestrear.");
        return;
      }
      const preclassified = await preclassifySamples(
        apiKey,
        rawSamples,
        categories,
        question
      );
      const startIndex = samples.length;
      setSamples((prev) => [
        ...prev,
        ...preclassified.map((p) => ({
          response: p.response,
          suggested: p.suggestedCategories,
          confidence: p.confidence,
          selected: [...p.suggestedCategories],
          done: false,
        })),
      ]);
      setCurrentIndex(startIndex);
      toast.success(`Se agregaron ${rawSamples.length} muestras más.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSave = async () => {
    if (samples.some((s) => s.selected.length === 0)) {
      toast.warning("Cada muestra debe tener al menos una categoría.");
      return;
    }
    setSaving(true);
    try {
      await saveSampleClassifications(
        jobId,
        samples.map((s) => ({
          response: s.response,
          suggestedCategories: s.suggested,
          confidence:
            s.confidence.length === s.selected.length
              ? s.confidence
              : s.selected.map(() => 0.9),
          correctedCategories: s.selected,
        }))
      );
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const current = samples[currentIndex];

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Entrenamiento de Muestras
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{question}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Target className="size-4" />
          {doneCount}/{total} completadas
        </div>
      </div>

      {alreadyDone && (
        <Badge variant="secondary">
          Entrenamiento guardado — podés corregir y guardar de nuevo
        </Badge>
      )}

      {/* Progreso */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progreso del entrenamiento</span>
          <span className="font-medium tabular-nums">{percent}%</span>
        </div>
        <Progress value={percent} />
      </div>

      {/* Navegación de muestras */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Navegación de muestras — {total} total (hacé clic para ir
            directamente)
          </p>
          {!allDone && doneCount < total && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={acceptAllRemaining}
            >
              Aceptar todas las restantes
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {samples.map((s, i) => (
            <button
              key={s.response.id}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "flex size-9 items-center justify-center rounded-md border text-sm transition-colors",
                i === currentIndex && "ring-2 ring-primary ring-offset-1",
                s.done
                  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Estado completado (se muestra ADEMÁS del editor, no en su lugar:
          las pills siguen editables y la última muestra no "desaparece"). */}
      {allDone && (
        <>
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="size-14 text-green-600" />
              <h2 className="text-xl font-bold text-green-700 dark:text-green-300">
                ¡Entrenamiento Completado!
              </h2>
              <p className="text-sm text-muted-foreground">
                Revisaste todas las {total} muestras. Ya podés continuar.
              </p>
              <Button
                size="lg"
                className="gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                ¡Terminar Entrenamiento Ahora!
              </Button>
            </CardContent>
          </Card>

          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="flex items-center gap-2 font-medium">
                <PartyPopper className="size-4" />
                ¡Completaste las {total} muestras!
              </p>
              <p className="text-sm text-muted-foreground">
                ¿Querés más ejemplos para un entrenamiento aún mejor? Podés
                agregar 15 muestras adicionales.
              </p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Target className="size-4" />
                )}
                Cargar 15 muestras más ({total} → {total + 15})
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Editor de muestra (siempre visible mientras haya una muestra activa) */}
      {current && (
          <Card>
            <CardContent className="space-y-5 py-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Muestra {currentIndex + 1} de {total}
                </h2>
                <Badge variant={current.done ? "default" : "outline"} className="gap-1">
                  {current.done ? (
                    <Check className="size-3" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                  {current.done ? "Completada" : "Pendiente"}
                </Badge>
              </div>

              <div className="rounded-lg bg-muted/40 p-4">
                <p className="mb-1 text-xs text-muted-foreground">Respuesta:</p>
                <p className="text-base font-medium">
                  {current.response.response_text}
                </p>
              </div>

              {current.suggested.length > 0 && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                    <Brain className="size-4" />
                    Sugerencia de IA:
                  </p>
                  <p className="mb-3 text-sm">
                    {current.suggested
                      .map(
                        (id) =>
                          `${getDisplayCategoryId(id)}: ${categoryName(id)}`
                      )
                      .join(", ")}
                    {current.confidence[0] != null && (
                      <span className="ml-2 text-muted-foreground">
                        {Math.round(current.confidence[0] * 100)}%
                      </span>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => acceptSuggestion(currentIndex)}
                  >
                    <CheckCircle2 className="size-4" />
                    Aceptar sugerencia
                  </Button>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-green-700 dark:text-green-400">
                  Tu clasificación:
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {allCategories.map((cat) => {
                    const selected = current.selected.includes(cat.category_id);
                    return (
                      <button
                        key={cat.category_id}
                        type="button"
                        onClick={() =>
                          toggleCategory(currentIndex, cat.category_id)
                        }
                        className={cn(
                          "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted"
                        )}
                      >
                        {getDisplayCategoryId(cat.category_id)}: {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  className="gap-1"
                  disabled={currentIndex === 0}
                  onClick={() => goTo(currentIndex - 1)}
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  className="gap-1"
                  onClick={() => nextSample(currentIndex)}
                >
                  Siguiente
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
      )}
    </div>
  );
}
