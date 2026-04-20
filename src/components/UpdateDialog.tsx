// Diálogo que se muestra cuando el updater detecta una nueva versión.
// Se conecta al plugin-updater de Tauri en Fase 4.
// UI a desarrollar.

export interface UpdateDialogProps {
  open: boolean;
  version?: string;
  notes?: string;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateDialog(_props: UpdateDialogProps) {
  return null;
}
