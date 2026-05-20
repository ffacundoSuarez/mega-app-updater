// Wizard de creación de proyecto del Limpiador. 3 pasos lógicos:
//
//   0. Nombre + descripción
//   1. Origen (Qualtrics o QuestionPro)
//   2. (sólo si QP) Link/ID de la encuesta + botón Validar
//
// Diferencia clave con mega-dashboard: la API key de QuestionPro NO se pide
// acá. Se lee de Ajustes (`questionpro.api_key`). Si falta, el wizard bloquea
// el paso 2 con un mensaje y opción de abrir Ajustes.
//
// Si el usuario eligió Qualtrics, el wizard salta el paso 2 y crea de una.

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createProject } from "@/lib/cleaning/projects-repository";
import {
  extractQuestionProSurveyId,
  validateSurvey,
} from "@/lib/questionpro";
import { getQuestionproApiKey, getQuestionproUserId } from "@/lib/settings";
import { SurveyPicker } from "@/components/SurveyPicker";
import { logActivity } from "@/lib/activity";
import type { CleaningProjectSource } from "@/lib/cleaning/types";

export interface NewProjectProps {
  onCancel: () => void;
  onCreated: (projectId: string) => void;
  onOpenSettings?: () => void;
}

interface SurveyValidation {
  name: string;
  totalResponses: number;
}

export function NewProject({
  onCancel,
  onCreated,
  onOpenSettings,
}: NewProjectProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<CleaningProjectSource | null>(null);

  // Estado de la pantalla QP (paso 2)
  const [qpApiKey, setQpApiKey] = useState<string | null>(null);
  const [qpUserId, setQpUserId] = useState<string | null>(null);
  const [qpKeyLoading, setQpKeyLoading] = useState(true);
  const [surveyInput, setSurveyInput] = useState("");
  const [surveyFieldError, setSurveyFieldError] = useState("");
  const [validating, setValidating] = useState(false);
  const [surveyValid, setSurveyValid] = useState<SurveyValidation | null>(null);

  // Estado de submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isQuestionPro = source === "questionpro";
  const totalSteps = isQuestionPro ? 3 : 2;
  const surveyId = extractQuestionProSurveyId(surveyInput);

  // Cuando entramos al paso QP, cargamos la key del store.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setQpKeyLoading(true);
    Promise.all([getQuestionproApiKey(), getQuestionproUserId()]).then(
      ([k, uid]) => {
        if (!cancelled) {
          setQpApiKey(k);
          setQpUserId(uid);
          setQpKeyLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [step]);

  const handleValidateSurvey = useCallback(async () => {
    setSurveyFieldError("");
    setSurveyValid(null);

    if (!qpApiKey) {
      setSurveyFieldError(
        "Falta la API Key de QuestionPro en Ajustes."
      );
      return;
    }
    if (!surveyId) {
      setSurveyFieldError("Ingresá un link o ID de encuesta válido.");
      return;
    }

    setValidating(true);
    try {
      const info = await validateSurvey(surveyId, qpApiKey);
      setSurveyValid({ name: info.name, totalResponses: info.totalResponses });
    } catch (err) {
      setSurveyFieldError(
        err instanceof Error ? err.message : "Error de conexión"
      );
    } finally {
      setValidating(false);
    }
  }, [qpApiKey, surveyId]);

  const handleCreate = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("El nombre del proyecto es obligatorio");
      return;
    }
    if (!source) {
      setError("Elegí un origen de datos");
      return;
    }
    if (source === "questionpro" && !surveyValid) {
      setError("Validá la encuesta de QuestionPro antes de crear el proyecto");
      return;
    }

    setSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        source,
        ...(source === "questionpro" && {
          qpSurveyId: surveyId,
          qpSurveyName: surveyValid!.name,
        }),
      });
      void logActivity({
        type: "limpiador_project_created",
        title: `Proyecto creado: ${project.name}`,
        toolId: "limpiador",
        viewId: "limpiador",
        payload: { projectId: project.id },
      });
      onCreated(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [name, description, source, surveyId, surveyValid, onCreated]);

  const goNext = () => {
    setError(null);
    if (step === 0) {
      if (!name.trim()) {
        setError("El nombre del proyecto es obligatorio");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!source) {
        setError("Elegí Qualtrics o QuestionPro");
        return;
      }
      // Si es Qualtrics, no hay paso 2: creamos directo.
      if (source === "qualtrics") {
        void handleCreate();
        return;
      }
      setStep(2);
      return;
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 0) {
      onCancel();
      return;
    }
    setStep((s) => (s === 2 ? 1 : 0));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Botón volver + título */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver a la lista
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Nuevo proyecto de limpieza
        </h2>
        <p className="text-sm text-muted-foreground">
          Paso {step + 1} de {totalSteps}
          {step === 0 && " · Datos del proyecto"}
          {step === 1 && " · Origen"}
          {step === 2 && " · Conexión QuestionPro"}
        </p>
      </div>

      {/* Barra de progreso */}
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderPlus className="size-4" />
            {step === 0 && "Datos del proyecto"}
            {step === 1 && "¿De dónde vienen las respuestas?"}
            {step === 2 && "Conexión QuestionPro"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {step === 0 && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-name">Nombre del proyecto *</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Encuesta de satisfacción 2026"
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-description">
                  Descripción (opcional)
                </Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notas internas sobre este proyecto…"
                  rows={3}
                  disabled={submitting}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SourceCard
                title="Qualtrics"
                description="Excel con 3 filas: IDs, textos de preguntas y datos."
                selected={source === "qualtrics"}
                onClick={() => setSource("qualtrics")}
              />
              <SourceCard
                title="QuestionPro"
                description="Export estándar: una fila de encabezados + datos. Requiere API para cruzar preguntas."
                selected={source === "questionpro"}
                onClick={() => setSource("questionpro")}
              />
            </div>
          )}

          {step === 2 && isQuestionPro && (
            <QuestionProStep
              apiKey={qpApiKey}
              userId={qpUserId}
              apiKeyLoading={qpKeyLoading}
              surveyInput={surveyInput}
              surveyFieldError={surveyFieldError}
              validating={validating}
              surveyValid={surveyValid}
              onSurveyInputChange={(v) => {
                setSurveyInput(v);
                setSurveyValid(null);
                setSurveyFieldError("");
              }}
              onValidate={() => void handleValidateSurvey()}
              onOpenSettings={onOpenSettings}
            />
          )}

          <div className="flex justify-between gap-3 pt-1">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={submitting || validating}
            >
              {step === 0 ? "Cancelar" : "Atrás"}
            </Button>

            {step === 1 && source === "qualtrics" ? (
              <Button onClick={goNext} disabled={submitting} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <FolderPlus className="size-4" />
                    Crear proyecto
                  </>
                )}
              </Button>
            ) : step === 2 ? (
              <Button
                onClick={() => void handleCreate()}
                disabled={submitting || !surveyValid}
                className="gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <FolderPlus className="size-4" />
                    Crear proyecto
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={submitting || (step === 1 && !source)}
                className="gap-2"
              >
                Siguiente
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Subcomponentes ---------------------------------------------------------

function SourceCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/40",
        selected ? "border-primary bg-primary/5" : "border-muted"
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

interface QuestionProStepProps {
  apiKey: string | null;
  userId: string | null;
  apiKeyLoading: boolean;
  surveyInput: string;
  surveyFieldError: string;
  validating: boolean;
  surveyValid: SurveyValidation | null;
  onSurveyInputChange: (v: string) => void;
  onValidate: () => void;
  onOpenSettings?: () => void;
}

function QuestionProStep({
  apiKey,
  userId,
  apiKeyLoading,
  surveyInput,
  surveyFieldError,
  validating,
  surveyValid,
  onSurveyInputChange,
  onValidate,
  onOpenSettings,
}: QuestionProStepProps) {
  if (apiKeyLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando configuración…
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-300">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              Falta la API Key de QuestionPro
            </span>
            <span className="text-xs text-muted-foreground">
              Cargala en <span className="font-mono">Ajustes</span> antes de
              crear un proyecto QuestionPro. La key vive sólo en tu máquina y se
              usa para validar la encuesta y, más adelante, sincronizar
              respuestas.
            </span>
          </div>
        </div>
        {onOpenSettings && (
          <div>
            <Button size="sm" variant="secondary" onClick={onOpenSettings}>
              Ir a Ajustes
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5" />
          <span>API Key de QuestionPro cargada en Ajustes.</span>
        </div>
      </div>

      <SurveyPicker
        apiKey={apiKey}
        userId={userId}
        value={surveyInput}
        onChange={onSurveyInputChange}
        onOpenSettings={onOpenSettings}
        disabled={validating}
      />
      {surveyFieldError && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" />
          {surveyFieldError}
        </p>
      )}

      <div>
        <Button
          variant="secondary"
          onClick={onValidate}
          disabled={validating}
          className="gap-2"
        >
          {validating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Validando…
            </>
          ) : (
            "Validar encuesta"
          )}
        </Button>
      </div>

      {surveyValid && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{surveyValid.name}</span>
            <span className="text-xs text-muted-foreground">
              {surveyValid.totalResponses} respuestas en QuestionPro
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
