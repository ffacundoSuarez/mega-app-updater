// Wrappers tipados sobre `invoke` de Tauri.
// A medida que agreguemos comandos en Rust (src-tauri/src/commands/),
// acá exponemos funciones TS que los llaman para mantener tipos en un solo lugar.

import { invoke } from "@tauri-apps/api/core";

/** Ejemplo de comando heredado del scaffold. Se puede borrar cuando se quite de Rust. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}
