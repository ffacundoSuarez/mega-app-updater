// Vista principal de la herramienta "Excel → PowerPoint".
// Layout base: header + card con el flujo de conversión.
// La lógica real se conecta en Fase 3 (comando Rust + script Python).

import { FileSpreadsheet, FileUp, Presentation, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function ExcelToPptxView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Header de la herramienta */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Excel → PowerPoint
          </h1>
          <p className="text-sm text-muted-foreground">
            Cargá una planilla de Excel y generá automáticamente una presentación
            lista para compartir.
          </p>
        </div>
      </div>

      <Separator />

      {/* Card con los pasos del flujo */}
      <Card>
        <CardHeader>
          <CardTitle>Nueva conversión</CardTitle>
          <CardDescription>
            Seleccioná el archivo de entrada y ajustá las opciones si es
            necesario.
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon" aria-label="Opciones">
              <Settings2 className="size-4" />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Drop zone / selector de archivo (placeholder) */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <FileUp className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                Arrastrá un archivo .xlsx acá
              </p>
              <p className="text-xs text-muted-foreground">
                o seleccionalo desde el explorador
              </p>
            </div>
            <Button size="sm" variant="secondary" disabled>
              Seleccionar archivo
            </Button>
          </div>

          {/* Acción principal */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Los archivos se procesan localmente. No se suben a ningún servidor.
            </div>
            <Button disabled className="gap-2">
              <Presentation className="size-4" />
              Generar presentación
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estado: UI conectada a backend en Fase 3 */}
      <p className="text-center text-xs text-muted-foreground">
        Funcionalidad en desarrollo · se habilita en la Fase 3 del proyecto.
      </p>
    </div>
  );
}
