// Diálogo para crear, renombrar o eliminar un bloque/sección del cuestionario.

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SectionDialogMode = "create" | "edit";

export interface SectionQuestionOption {
  id: string;
  code: string;
  text: string;
}

export interface SectionDialogProps {
  open: boolean;
  mode: SectionDialogMode;
  initialName?: string;
  questionCount?: number;
  questionOptions?: SectionQuestionOption[];
  defaultSelectedIds?: string[];
  /** Si true y mode==="edit", se abre directamente en el confirm dual
   *  (sólo bloque / bloque + preguntas) sin pasar por el botón "Eliminar…".
   *  Útil cuando el call site ya es la acción de borrar. */
  defaultConfirmDelete?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, questionIds: string[]) => void;
  onDelete?: (deleteQuestions: boolean) => void;
}

export function SectionDialog({
  open,
  mode,
  initialName = "",
  questionCount = 0,
  questionOptions = [],
  defaultSelectedIds = [],
  defaultConfirmDelete = false,
  onOpenChange,
  onConfirm,
  onDelete,
}: SectionDialogProps) {
  const [name, setName] = useState(initialName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setName(initialName);
      setConfirmDelete(defaultConfirmDelete);
      setSelectedIds(new Set(defaultSelectedIds));
    }
  }, [open, initialName, defaultSelectedIds, defaultConfirmDelete]);

  const trimmed = name.trim();
  const canSave =
    trimmed.length > 0 &&
    (mode === "create" || trimmed !== initialName.trim());

  // Cuando venimos del flujo "trash" del ManageDialog: defaultConfirmDelete
  // arranca en true. En ese caso ocultamos el input de rename y el footer de
  // guardar — el usuario ya eligió "borrar", no tiene sentido mostrarle más.
  const isPureDeleteFlow =
    mode === "edit" && defaultConfirmDelete && confirmDelete;

  function toggleQuestion(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onConfirm(trimmed, mode === "create" ? Array.from(selectedIds) : []);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,680px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2">
            <DialogHeader>
              <DialogTitle>
                {mode === "create"
                  ? "Nuevo bloque"
                  : isPureDeleteFlow
                    ? "Eliminar bloque"
                    : "Editar bloque"}
              </DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "Elegí un nombre y, si querés, qué preguntas incluir. Podés crear el bloque vacío."
                  : isPureDeleteFlow
                    ? `Confirmá cómo querés eliminar "${initialName}".`
                    : "Cambiá el nombre del bloque o eliminalo."}
              </DialogDescription>
            </DialogHeader>

            {!isPureDeleteFlow && (
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="section-name">Nombre del bloque</Label>
                <Input
                  id="section-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Perfil del encuestado"
                  autoFocus
                />
              </div>
            )}

            {mode === "create" && questionOptions.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Preguntas a incluir (opcional)</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setSelectedIds(
                          new Set(questionOptions.map((q) => q.id))
                        )
                      }
                    >
                      Todas
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Ninguna
                    </Button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border border-border/60">
                  {questionOptions.map((q) => {
                    const checked = selectedIds.has(q.id);
                    return (
                      <label
                        key={q.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 border-b border-border/40 px-3 py-2 last:border-b-0 hover:bg-muted/40",
                          checked && "bg-muted/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleQuestion(q.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {q.code}
                          </span>
                          <span className="block text-xs leading-snug">
                            {q.text.trim() || (
                              <span className="italic text-muted-foreground">
                                Sin texto
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {selectedIds.size === 0
                    ? "Sin selección: se creará un bloque vacío."
                    : `${selectedIds.size} pregunta${
                        selectedIds.size === 1 ? "" : "s"
                      } seleccionada${selectedIds.size === 1 ? "" : "s"}.`}
                </p>
              </div>
            )}

            {mode === "edit" && onDelete && !confirmDelete && (
              <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Este bloque tiene{" "}
                  <span className="font-medium text-foreground">
                    {questionCount}
                  </span>{" "}
                  pregunta{questionCount === 1 ? "" : "s"}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar bloque…
                </Button>
              </div>
            )}

            {mode === "edit" && confirmDelete && onDelete && (
              <div className="mt-4 flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    ¿Cómo querés eliminar{" "}
                    <span className="font-medium">{initialName}</span>?
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto flex-col items-start gap-0.5 py-2"
                    onClick={() => {
                      onDelete(false);
                      onOpenChange(false);
                    }}
                  >
                    <span>Sólo el bloque</span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      Las preguntas quedan sin bloque asignado
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-auto flex-col items-start gap-0.5 py-2"
                    onClick={() => {
                      onDelete(true);
                      onOpenChange(false);
                    }}
                  >
                    <span>Bloque y preguntas</span>
                    <span className="text-[10px] font-normal opacity-80">
                      Se eliminan las {questionCount} pregunta
                      {questionCount === 1 ? "" : "s"} del bloque
                    </span>
                  </Button>
                </div>
                {!isPureDeleteFlow && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-0 shrink-0 border-t bg-muted/30 px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            {!isPureDeleteFlow && (
              <Button type="submit" disabled={!canSave}>
                {mode === "create" ? "Crear bloque" : "Guardar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
