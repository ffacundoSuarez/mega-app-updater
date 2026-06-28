import { toast } from "sonner";

/** Muestra un error al usuario vía toast (reemplazo de window.alert). */
export function notifyError(message: string): void {
  toast.error(message);
}

/** Muestra éxito breve vía toast. */
export function notifySuccess(message: string): void {
  toast.success(message);
}

/** Muestra advertencia breve vía toast. */
export function notifyWarning(message: string): void {
  toast.warning(message);
}
