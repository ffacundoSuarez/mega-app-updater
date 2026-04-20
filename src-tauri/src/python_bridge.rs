//! Puente Rust ↔ sidecar Python.
//!
//! Responsabilidades:
//!   - Resolver la ruta a `python.exe` y a los scripts empaquetados como
//!     bundle resources (ver `tauri.conf.json` → `bundle.resources`).
//!   - Ejecutar un script con args y recuperar stdout/stderr/exit code.
//!
//! Contrato con los scripts Python:
//!   - stdout: una línea JSON con el resultado final.
//!   - stderr: mensajes de error / logs opcionales.
//!   - exit code: 0 = ok, ≠0 = error.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
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

/// Salida "raw" de un script Python.
#[derive(Debug, Serialize)]
pub struct PythonOutput {
    /// stdout tal cual. Los scripts deben devolver una línea JSON acá.
    pub stdout: String,
    /// stderr útil para debugging / mostrar warnings en dev.
    pub stderr: String,
}

/// Ejecuta `python-runtime/python.exe <script> [args...]` y devuelve stdout/stderr.
///
/// Falla si el sidecar no está bundleado o si el script sale con código ≠ 0.
pub async fn run_python_script(
    app: &AppHandle,
    script_name: &str,
    args: &[&str],
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

    // 4. Ejecutar vía tauri-plugin-shell. `output()` es async, espera al final.
    let output = app
        .shell()
        .command(python_exe.to_string_lossy().as_ref())
        .args(cmd_args)
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
