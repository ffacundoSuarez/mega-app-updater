//! Puente Rust ↔ sidecar Python.
//!
//! Responsabilidades:
//!   - Resolver la ruta a `python.exe` y a los scripts empaquetados como
//!     bundle resources (ver `tauri.conf.json` → `bundle.resources`).
//!   - Ejecutar un script con args, env vars, cwd, y opcionalmente streamear
//!     stdout/stderr como eventos Tauri para que la UI muestre progreso.
//!
//! Contrato con los scripts Python:
//!   - stdout: línea(s) JSON. La última línea no vacía es el resultado final.
//!     Líneas intermedias con `"type": "progress"` son eventos de progreso
//!     opcionales que podemos reenviar al frontend.
//!   - stderr: logs libres / warnings / debug.
//!   - exit code: 0 = ok, ≠0 = error.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use thiserror::Error;

// Rutas relativas dentro de los resources del bundle (ver tauri.conf.json).
// En dev Tauri los resuelve desde `src-tauri/`, en prod desde `resources/`.
const PYTHON_RUNTIME_DIR: &str = "python-runtime";
const PYTHON_SCRIPTS_DIR: &str = "python-scripts";
const PYTHON_EXECUTABLE: &str = "python.exe";

/// Errores posibles al ejecutar el sidecar Python.
/// Se serializan a String al cruzar la frontera a JS (los errores de Tauri
/// commands deben implementar `Serialize`).
#[derive(Debug, Error)]
pub enum PythonBridgeError {
    #[error("No se pudo resolver la ruta de un recurso: {0}")]
    ResolvePath(#[from] tauri::Error),

    #[error("El ejecutable de Python no existe en {path}. Corré `npm run bundle:python`.")]
    PythonNotBundled { path: PathBuf },

    #[error("El script '{script}' no existe en el bundle.")]
    ScriptNotFound { script: String },

    #[error("Falló la ejecución del sidecar: {0}")]
    Spawn(String),

    #[error(
        "El script '{script}' salió con código {code}. stderr:\n{stderr}"
    )]
    NonZeroExit {
        script: String,
        code: i32,
        stderr: String,
    },
}

// Tauri commands necesitan errores serializables → los mandamos como string.
impl Serialize for PythonBridgeError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Salida "raw" de un script Python (modo `output()` — espera al final y
/// devuelve todo junto). Útil para scripts cortos tipo `hello.py`.
#[derive(Debug, Serialize)]
pub struct PythonOutput {
    /// stdout completo.
    pub stdout: String,
    /// stderr completo.
    pub stderr: String,
}

/// Opciones de ejecución del sidecar.
#[derive(Debug, Default)]
pub struct PythonRunOptions {
    /// Variables de entorno adicionales. Se fusionan con las del proceso padre.
    /// Útil para pasar secrets (ej. `GEMINI_API_KEY`) sin que queden en argv.
    pub env: HashMap<String, String>,
    /// Directorio de trabajo del subproceso. Si es None, hereda del padre.
    pub cwd: Option<PathBuf>,
    /// Si es Some, cada línea de stdout/stderr se emite como evento Tauri con
    /// este nombre + payload `{stream: "stdout"|"stderr", line: "..."}` para
    /// que la UI muestre logs/progreso en vivo. Si es None, se junta todo al
    /// final (modo `output`).
    pub stream_event: Option<String>,
}

/// Ejecuta `python-runtime/python.exe <script> [args...]` con opciones.
///
/// Modo "batched" (opts.stream_event = None): espera al final del proceso y
/// devuelve stdout/stderr agregados. Bueno para scripts cortos.
///
/// Modo "streaming" (opts.stream_event = Some("nombre-evento")): emite un
/// evento Tauri por cada línea de stdout/stderr. Igualmente acumula todo
/// para devolverlo al final. Bueno para scripts largos con progreso.
pub async fn run_python_script(
    app: &AppHandle,
    script_name: &str,
    args: &[&str],
    opts: PythonRunOptions,
) -> Result<PythonOutput, PythonBridgeError> {
    // 1. Resolver python.exe desde los resources del bundle.
    let python_exe: PathBuf = app.path().resolve(
        format!("{PYTHON_RUNTIME_DIR}/{PYTHON_EXECUTABLE}"),
        BaseDirectory::Resource,
    )?;
    if !python_exe.exists() {
        return Err(PythonBridgeError::PythonNotBundled { path: python_exe });
    }

    // 2. Resolver el script a correr.
    let script_path: PathBuf = app.path().resolve(
        format!("{PYTHON_SCRIPTS_DIR}/{script_name}"),
        BaseDirectory::Resource,
    )?;
    if !script_path.exists() {
        return Err(PythonBridgeError::ScriptNotFound {
            script: script_name.to_string(),
        });
    }

    // 3. Armar los args: [script_path, ...user_args]
    let mut cmd_args: Vec<String> = vec![script_path.to_string_lossy().into_owned()];
    cmd_args.extend(args.iter().map(|s| s.to_string()));

    // 4. Construir el comando vía tauri-plugin-shell.
    let mut cmd = app
        .shell()
        .command(python_exe.to_string_lossy().as_ref())
        .args(cmd_args);

    // Forzamos UTF-8 en stdout/stderr de Python globalmente. En Windows,
    // el encoding default de consola (cp1252) no puede codificar emojis y
    // tira UnicodeEncodeError en cualquier print/logging.info que use 🧹, ⚠️, etc.
    // Esto se aplica a TODOS los scripts del sidecar, no sólo a brand_audit.
    cmd = cmd.env("PYTHONIOENCODING", "utf-8");
    // Python >= 3.7 — fuerza UTF-8 para sys.stdin/out/err y los encodings locales.
    cmd = cmd.env("PYTHONUTF8", "1");

    if !opts.env.is_empty() {
        cmd = cmd.envs(opts.env.clone());
    }
    if let Some(cwd) = opts.cwd.as_ref() {
        cmd = cmd.current_dir(cwd.clone());
    }

    // 5. Si hay stream_event, usamos `spawn()` y leemos CommandEvent line-by-line.
    //    Si no, el modo simple `output()` alcanza.
    if let Some(event_name) = opts.stream_event.as_ref() {
        let (mut rx, _child) = cmd
            .spawn()
            .map_err(|e| PythonBridgeError::Spawn(e.to_string()))?;

        let mut stdout_buf = String::new();
        let mut stderr_buf = String::new();
        let mut exit_code: i32 = -1;
        let mut errored = false;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    stdout_buf.push_str(&line);
                    stdout_buf.push('\n');
                    // Emitimos ignorando errores — si el listener ya murió, no importa.
                    let _ = app.emit(
                        event_name,
                        serde_json::json!({"stream": "stdout", "line": line.trim_end()}),
                    );
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    stderr_buf.push_str(&line);
                    stderr_buf.push('\n');
                    let _ = app.emit(
                        event_name,
                        serde_json::json!({"stream": "stderr", "line": line.trim_end()}),
                    );
                }
                CommandEvent::Terminated(payload) => {
                    exit_code = payload.code.unwrap_or(-1);
                }
                CommandEvent::Error(err) => {
                    stderr_buf.push_str(&format!("[shell error] {err}\n"));
                    errored = true;
                }
                _ => {}
            }
        }

        if errored || exit_code != 0 {
            return Err(PythonBridgeError::NonZeroExit {
                script: script_name.to_string(),
                code: exit_code,
                stderr: stderr_buf,
            });
        }

        return Ok(PythonOutput {
            stdout: stdout_buf,
            stderr: stderr_buf,
        });
    }

    // Modo batched (el que ya usaba `run_python_hello`).
    let output = cmd
        .output()
        .await
        .map_err(|e| PythonBridgeError::Spawn(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(PythonBridgeError::NonZeroExit {
            script: script_name.to_string(),
            code: output.status.code().unwrap_or(-1),
            stderr,
        });
    }

    Ok(PythonOutput { stdout, stderr })
}
