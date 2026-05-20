// Selector de encuesta QuestionPro: lista desde la API o entrada manual.

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  extractQuestionProSurveyId,
  listUserSurveys,
  type QPSurveyListItem,
} from "@/lib/questionpro";

export interface SurveyPickerProps {
  apiKey: string;
  userId: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Llamado al elegir de la lista (antes de validar). */
  onPickFromList?: (survey: QPSurveyListItem) => void;
  onOpenSettings?: () => void;
}

export function SurveyPicker({
  apiKey,
  userId,
  value,
  onChange,
  disabled,
  onPickFromList,
  onOpenSettings,
}: SurveyPickerProps) {
  const [surveys, setSurveys] = useState<QPSurveyListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const surveyId = extractQuestionProSurveyId(value);
  const selectedInList = surveys.find((s) => s.id === surveyId);

  const loadSurveys = useCallback(async () => {
    if (!userId?.trim()) {
      setListError("Falta el User ID de QuestionPro en Ajustes.");
      return;
    }
    setLoadingList(true);
    setListError(null);
    try {
      const list = await listUserSurveys(userId, apiKey, { activeOnly: false });
      setSurveys(list);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
      setSurveys([]);
    } finally {
      setLoadingList(false);
    }
  }, [apiKey, userId]);

  useEffect(() => {
    void loadSurveys();
  }, [loadSurveys]);

  const handleSelect = (id: string) => {
    const item = surveys.find((s) => s.id === id);
    if (item) {
      onChange(item.id);
      onPickFromList?.(item);
      setManualOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Encuesta en QuestionPro</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => void loadSurveys()}
            disabled={disabled || loadingList || !userId}
          >
            {loadingList ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Actualizar lista
          </Button>
        </div>

        {!userId ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="text-amber-300">
              Para ver la lista de encuestas, cargá el{" "}
              <span className="font-medium">User ID</span> de QuestionPro en
              Ajustes.
            </p>
            {onOpenSettings && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={onOpenSettings}
              >
                Ir a Ajustes
              </Button>
            )}
          </div>
        ) : listError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{listError}</span>
          </div>
        ) : (
          <Select
            value={selectedInList?.id ?? ""}
            onValueChange={handleSelect}
            disabled={disabled || loadingList || surveys.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  loadingList
                    ? "Cargando encuestas…"
                    : surveys.length === 0
                      ? "No hay encuestas en esta cuenta"
                      : "Elegí una encuesta"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {surveys.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.id}
                  {s.completedResponses != null
                    ? ` · ${s.completedResponses} resp.`
                    : ""}
                  )
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-fit gap-1 px-0 text-xs text-muted-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                manualOpen && "rotate-180"
              )}
            />
            Pegar URL o ID manualmente
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://www.questionpro.com/… o 12345678"
            disabled={disabled}
          />
          {value && surveyId && surveyId !== value.trim() && (
            <p className="mt-1 text-xs text-muted-foreground">
              Survey ID detectado:{" "}
              <span className="font-mono font-medium">{surveyId}</span>
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
