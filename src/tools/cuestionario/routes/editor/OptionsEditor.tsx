// Editor de la lista de opciones de una pregunta cerrada / escala / matriz.
//
// Cada opción tiene: código (int), texto, flujo (string libre), condiciones
// (array de tags: fijar/especificar/exclusiva). El flujo se usa para skip
// logic ligada a la opción (ej. "saltar_a F5" o "terminar"); el flujo a nivel
// de pregunta se edita en `FlowEditor`.

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OptionCondition,
  QuestionOption,
} from "@/lib/cuestionario/types";

const VALID_OPTION_CONDITIONS: readonly OptionCondition[] = [
  "fijar",
  "especificar",
  "exclusiva",
];

export interface OptionsEditorProps {
  value: QuestionOption[];
  onChange: (next: QuestionOption[]) => void;
  disabled?: boolean;
  /** Label del botón "agregar opción". Por defecto: "Agregar opción".
   *  Pasar "Agregar enunciado" cuando se usa para la matriz. */
  addLabel?: string;
  /** Label en el título del bloque. */
  title?: string;
  /** Si true, muestra un placeholder del flujo ("saltar_a F5"). Para enunciados
   *  de matriz no tiene sentido editar flujo de fila, pero se permite igual. */
  showFlow?: boolean;
}

export function OptionsEditor({
  value,
  onChange,
  disabled,
  addLabel = "Agregar opción",
  title = "Opciones",
  showFlow = true,
}: OptionsEditorProps) {
  function update(index: number, patch: Partial<QuestionOption>) {
    onChange(
      value.map((opt, i) => (i === index ? { ...opt, ...patch } : opt))
    );
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function addNew() {
    const nextCode = nextOptionCode(value);
    onChange([
      ...value,
      { codigo: nextCode, texto: "", flujo: "", condicion: [] },
    ]);
  }
  function toggleCondition(index: number, cond: OptionCondition) {
    const opt = value[index];
    const has = opt.condicion.includes(cond);
    const nextConds = has
      ? opt.condicion.filter((c) => c !== cond)
      : [...opt.condicion, cond];
    update(index, { condicion: nextConds });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title}{" "}
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
          {addLabel}
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
          Sin opciones. Tocá "{addLabel}" para sumar la primera.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {value.map((opt, i) => (
            <li
              key={i}
              className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-background p-2"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                <GripVertical className="size-3.5 opacity-50" />
              </span>
              <Input
                type="number"
                value={opt.codigo}
                onChange={(e) =>
                  update(i, { codigo: parseIntOr(e.target.value, opt.codigo) })
                }
                disabled={disabled}
                className="w-16 font-mono text-xs"
                aria-label={`Código opción ${i + 1}`}
              />
              <Input
                value={opt.texto}
                onChange={(e) => update(i, { texto: e.target.value })}
                disabled={disabled}
                placeholder={`Texto de la opción ${i + 1}`}
                className="min-w-[180px] flex-1 text-sm"
              />
              {showFlow && (
                <Input
                  value={opt.flujo}
                  onChange={(e) => update(i, { flujo: e.target.value })}
                  disabled={disabled}
                  placeholder="Flujo (ej: saltar_a F5)"
                  className="w-44 font-mono text-xs"
                  aria-label={`Flujo opción ${i + 1}`}
                />
              )}
              <div className="flex flex-wrap items-center gap-1">
                {VALID_OPTION_CONDITIONS.map((c) => {
                  const active = opt.condicion.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCondition(i, c)}
                      disabled={disabled}
                      className="cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className="font-normal"
                      >
                        {c}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label="Eliminar opción"
                className="size-7 shrink-0"
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

function nextOptionCode(opts: QuestionOption[]): number {
  if (opts.length === 0) return 1;
  return Math.max(...opts.map((o) => o.codigo)) + 1;
}

function parseIntOr(v: string, fallback: number): number {
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
