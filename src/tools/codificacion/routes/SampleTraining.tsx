import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  selectedCategories: number[];
}

export interface SampleTrainingProps {
  jobId: string;
  onBack: () => void;
  onComplete: () => void;
}

export function SampleTraining({ jobId, onBack, onComplete }: SampleTrainingProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [alreadyDone, setAlreadyDone] = useState(false);

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
            selectedCategories: s.user_corrected_categories,
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
          selectedCategories: p.suggestedCategories,
        }))
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      onBack();
    } finally {
      setLoading(false);
    }
  }, [jobId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCategory = (sampleIndex: number, categoryId: number) => {
    setSamples((prev) =>
      prev.map((row, i) => {
        if (i !== sampleIndex) return row;
        const has = row.selectedCategories.includes(categoryId);
        const next = has
          ? row.selectedCategories.filter((id) => id !== categoryId)
          : [...row.selectedCategories, categoryId];
        return { ...row, selectedCategories: next.length ? next : [categoryId] };
      })
    );
  };

  const handleSave = async () => {
    if (samples.some((s) => s.selectedCategories.length === 0)) {
      window.alert("Cada muestra debe tener al menos una categoría");
      return;
    }
    setSaving(true);
    try {
      await saveSampleClassifications(
        jobId,
        samples.map((s) => ({
          response: s.response,
          suggestedCategories: s.selectedCategories,
          confidence: s.selectedCategories.map(() => 0.9),
          correctedCategories: s.selectedCategories,
        }))
      );
      onComplete();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const allCategories = [
    ...categories,
    { category_id: 998, name: "No responde", id: "998" },
    { category_id: 999, name: "Otro", id: "999" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Volver
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entrenamiento con muestras</CardTitle>
          <p className="text-sm text-muted-foreground">{question}</p>
          {alreadyDone && (
            <Badge variant="secondary">Entrenamiento guardado — podés corregir y guardar de nuevo</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {samples.map((sample, index) => (
            <div key={sample.response.id} className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">
                Muestra {index + 1}
              </p>
              <p className="mb-3 rounded bg-muted/40 p-2 text-sm">
                {sample.response.response_text}
              </p>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((cat) => {
                  const id = cat.category_id;
                  const checked = sample.selectedCategories.includes(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCategory(index, id)}
                      />
                      {getDisplayCategoryId(id)}: {cat.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onBack}>
              Cancelar
            </Button>
            <Button className="gap-2" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Guardar entrenamiento
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
