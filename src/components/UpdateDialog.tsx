// Diálogo modal del auto-updater (Fase 4 del PLAN).
//
// Comportamiento por decisión de producto:
//   - Update OBLIGATORIO: no hay botón "Más tarde", el dialog no se cierra
//     con Esc ni click afuera. Una vez detectada una versión nueva, el usuario
//     tiene que actualizar para seguir usando la app.
//   - `installMode: passive` en `tauri.conf.json`: Windows muestra su propia UI
//     de progreso durante la instalación. Este componente solo cubre la etapa
//     previa (descarga) con una barra de progreso propia.
//
// Estados del flujo:
//   `available`   → aparece el detalle de la versión + botón "Actualizar ahora".
//   `downloading` → barra de progreso (MB descargados / total).
//   `installing`  → mensaje "Instalando..." justo antes de que la app se cierre.
//   `error`       → texto del error + botón "Reintentar".

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import {
  installUpdate,
  type Update,
} from "@/lib/updater";

export interface UpdateDialogProps {
  /** Update pendiente detectado por `checkForUpdate`. Si es null, no se muestra nada. */
  update: Update | null;
  /** Versión actual de la app (para mostrar en el diálogo). */
  currentVersion: string;
}

type Phase =
  | { kind: "available" }
  | { kind: "downloading"; downloaded: number; total: number }
  | { kind: "installing" }
  | { kind: "error"; message: string };

/** Formatea bytes a MB con 1 decimal para mostrar en la UI. */
function toMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export function UpdateDialog({ update, currentVersion }: UpdateDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "available" });

  // Si no hay update, no renderizamos nada. El padre decide cuándo hay uno.
  if (!update) return null;

  const handleInstall = async () => {
    setPhase({ kind: "downloading", downloaded: 0, total: 0 });
    try {
      await installUpdate(update, (downloaded, total) => {
        setPhase({ kind: "downloading", downloaded, total });
      });
      // Si llegamos acá, la descarga terminó y se está ejecutando el MSI.
      // La app va a cerrarse en cualquier momento.
      setPhase({ kind: "installing" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Percentage solo aplica a la fase de descarga.
  const percent =
    phase.kind === "downloading" && phase.total > 0
      ? Math.round((phase.downloaded / phase.total) * 100)
      : 0;

  return (
    <Dialog
      open={true}
      // Bloqueamos el cierre: el update es obligatorio.
      onOpenChange={() => {
        /* no-op intencional */
      }}
    >
      <DialogContent
        // Sin botón X, sin Esc, sin click afuera.
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        {phase.kind === "available" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="size-4" />
                Nueva versión disponible
              </DialogTitle>
              <DialogDescription>
                Hay una actualización lista para instalarse. Para seguir usando
                la app es necesario actualizar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Versión actual</span>
                <span className="font-mono">{currentVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nueva versión</span>
                <span className="font-mono font-semibold">
                  {update.version}
                </span>
              </div>

              {update.body && (
                <div className="mt-2 flex flex-col gap-1">
                  <span className="text-muted-foreground">Cambios:</span>
                  <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
                    {update.body}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleInstall} className="w-full sm:w-auto">
                <Download className="size-4" />
                Actualizar ahora
              </Button>
            </DialogFooter>
          </>
        )}

        {phase.kind === "downloading" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Descargando actualización...
              </DialogTitle>
              <DialogDescription>
                No cierres la aplicación durante la descarga.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Progress value={percent} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {phase.total > 0
                    ? `${toMB(phase.downloaded)} MB de ${toMB(phase.total)} MB`
                    : "Iniciando..."}
                </span>
                <span>{percent}%</span>
              </div>
            </div>
          </>
        )}

        {phase.kind === "installing" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Instalando...
              </DialogTitle>
              <DialogDescription>
                Windows está aplicando la actualización. La app se va a cerrar y
                volver a abrir sola en unos segundos.
              </DialogDescription>
            </DialogHeader>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                No se pudo actualizar
              </DialogTitle>
              <DialogDescription>
                Hubo un error durante la actualización. Verificá tu conexión y
                probá de nuevo.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
              {phase.message}
            </div>

            <DialogFooter>
              <Button
                onClick={handleInstall}
                variant="default"
                className="w-full sm:w-auto"
              >
                Reintentar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
