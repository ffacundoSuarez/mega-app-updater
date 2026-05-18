// Editor de las reglas de flujo a nivel de pregunta.
//
// Cada regla: { si_respuesta: int|int[], accion: "saltar_a" | "terminar" |
// "continuar", destino?: string }. `si_respuesta` se edita como una lista de
// ints separados por coma (más simple que un picker dinámico ligado a las
// opciones, y matchea el formato que usa survey-qc-app).

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowRule } from "@/lib/cuestionario/types";

export interface FlowEditorProps {
  value: FlowRule[];
  onChange: (next: FlowRule[]) => void;
  disabled?: boolean;
}

type Accion = FlowRule["accion"];
const ACCIONES: Accion[] = ["saltar_a", "terminar", "continuar"];

export function FlowEditor({ value, onChange, disabled }: FlowEditorProps) {
  function update(index: number, patch: Partial<FlowRule>) {
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function addNew() {
    onChange([
      ...value,
      { si_respuesta: [], accion: "saltar_a", destino: "" },
    ]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Reglas de flujo{" "}
          <span className="font-normal opacity-70">({value.length})</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={addNew}
          disabled={disabled}
          className="gap-1 text-xs"
        >
          <Plus className="size-3.5" />
          Agregar regla
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
          Sin reglas de flujo. La pregunta cae a la siguiente del orden.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {value.map((rule, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background p-2 text-xs"
            >
              <span className="text-muted-foreground">Si respuesta ∈</span>
              <Input
                value={formatSiRespuesta(rule.si_respuesta)}
                onChange={(e) =>
                  update(i, { si_respuesta: parseSiRespuesta(e.target.value) })
                }
                disabled={disabled}
                placeholder="1, 2, 3"
                className="w-32 font-mono text-xs"
                aria-label={`Si respuesta regla ${i + 1}`}
              />
              <select
                value={rule.accion}
                onChange={(e) =>
                  update(i, {
                    accion: e.target.value as Accion,
                    destino: e.target.value === "saltar_a" ? rule.destino ?? "" : undefined,
                  })
                }
                disabled={disabled}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                {ACCIONES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {rule.accion === "saltar_a" && (
                <Input
                  value={rule.destino ?? ""}
                  onChange={(e) =>
                    update(i, { destino: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="ID destino (ej. F5)"
                  className="w-32 font-mono text-xs"
                  aria-label={`Destino regla ${i + 1}`}
                />
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label="Eliminar regla"
                className="size-7"
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSiRespuesta(v: number | number[]): string {
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function parseSiRespuesta(input: string): number | number[] {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nums = parts
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return [];
  if (nums.length === 1) return nums[0];
  return nums;
}
