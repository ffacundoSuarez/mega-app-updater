// Wrappers tipados sobre `invoke` de Tauri.
// A medida que agreguemos comandos en Rust (src-tauri/src/commands/),
// acá exponemos funciones TS que los llaman para mantener tipos en un solo lugar.

import { invoke } from "@tauri-apps/api/core";

/** Ejemplo de comando heredado del scaffold. Se puede borrar cuando se quite de Rust. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

// --- Sidecar Python -------------------------------------------------------

/** Respuesta de `hello.py`. El shape debe coincidir con `PythonHelloResponse`
 *  en src-tauri/src/commands/python.rs. */
export interface PythonHelloResponse {
  /** JSON crudo parseado del stdout del script. */
  raw: {
    ok: boolean;
    message: string;
    python: { version: string; implementation: string; executable: string };
    platform: { system: string; release: string; machine: string };
    dependencies: Array<
      | { name: string; ok: true; version: string }
      | { name: string; ok: false; error: string }
    >;
    timestamp: string;
  };
  /** stderr del proceso (normalmente vacío). */
  stderr: string;
}

/** Ping al sidecar Python: ejecuta `python-scripts/hello.py` con un nombre
 *  opcional. Sirve para verificar en Fase 2 que el sidecar arranca y que
 *  las deps están instaladas. */
export function runPythonHello(name?: string): Promise<PythonHelloResponse> {
  return invoke<PythonHelloResponse>("run_python_hello", { name });
}
