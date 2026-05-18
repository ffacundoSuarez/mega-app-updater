// Panel de metadata del cuestionario (Editor tipado).
//
// Edita el bloque `metadata` del Questionnaire canónico: título, idioma, país,
// fecha. Se renderiza colapsado por defecto: la mayoría del trabajo del
// usuario es sobre las preguntas, no sobre estos campos.

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuestionnaireMetadata } from "@/lib/cuestionario/types";

export interface MetadataPanelProps {
  value: QuestionnaireMetadata;
  onChange: (next: QuestionnaireMetadata) => void;
  disabled?: boolean;
}

export function MetadataPanel({ value, onChange, disabled }: MetadataPanelProps) {
  const [open, setOpen] = useState(false);

  function patch<K extends keyof QuestionnaireMetadata>(
    key: K,
    val: QuestionnaireMetadata[K]
  ) {
    onChange({ ...value, [key]: val });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-6 py-4 text-left hover:bg-muted/30"
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <div className="flex flex-1 flex-col">
          <CardTitle className="text-base">Metadata del cuestionario</CardTitle>
          <CardDescription className="text-xs">
            {value.titulo || "Sin título"} · {value.idioma || "?"}
            {value.pais ? ` · ${value.pais}` : ""}
          </CardDescription>
        </div>
      </button>
      {open && (
        <>
          <CardHeader className="sr-only">
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="meta-titulo">Título</Label>
              <Input
                id="meta-titulo"
                value={value.titulo}
                onChange={(e) => patch("titulo", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-idioma">Idioma</Label>
              <Input
                id="meta-idioma"
                value={value.idioma}
                onChange={(e) => patch("idioma", e.target.value)}
                disabled={disabled}
                placeholder="es"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-pais">País</Label>
              <Input
                id="meta-pais"
                value={value.pais}
                onChange={(e) => patch("pais", e.target.value)}
                disabled={disabled}
                placeholder="Argentina"
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="meta-fecha">Fecha (YYYY-MM-DD)</Label>
              <Input
                id="meta-fecha"
                value={value.fecha}
                onChange={(e) => patch("fecha", e.target.value)}
                disabled={disabled}
                placeholder="2026-05-15"
                className="font-mono"
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="size-3" />
                Sólo informativo: no se usa en los checks ni en la publicación a
                QuestionPro.
              </p>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
