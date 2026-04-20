//! Comandos relacionados al sidecar Python.
//!
//! Por ahora solo exponemos `run_python_hello`, un ping que sirve para
//! validar en Fase 2 que todo el pipeline (bundle → resolve → spawn →
//! parse) funciona en dev y en el MSI empaquetado.

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::python_bridge::{run_python_script, PythonBridgeError};

/// Respuesta del ping al sidecar Python.
///
/// - `raw`: JSON crudo parseado desde stdout de hello.py. Útil para la UI.
/// - `stderr`: cualquier mensaje de stderr (normalmente vacío).
#[derive(Debug, Serialize)]
pub struct PythonHelloResponse {
    pub raw: Value,
    pub stderr: String,
}

/// Comando expuesto al frontend: ejecuta `python-scripts/hello.py`
/// opcionalmente con un nombre a saludar, y devuelve el JSON de respuesta.
#[tauri::command]
pub async fn run_python_hello(
    app: AppHandle,
    name: Option<String>,
) -> Result<PythonHelloResponse, PythonBridgeError> {
    // Convertimos Option<String> a &[&str] para pasarle al sidecar.
    let args: Vec<&str> = match name.as_deref() {
        Some(n) if !n.is_empty() => vec![n],
        _ => vec![],
    };

    let output = run_python_script(&app, "hello.py", &args).await?;

    // El script garantiza una línea JSON por stdout. Si no parsea, devolvemos
    // el error como string para que el usuario pueda diagnosticar.
    let raw: Value = serde_json::from_str(output.stdout.trim()).map_err(|e| {
        PythonBridgeError::Spawn(format!(
            "Respuesta inválida del script hello.py: {e}. stdout crudo:\n{}",
            output.stdout
        ))
    })?;

    Ok(PythonHelloResponse {
        raw,
        stderr: output.stderr,
    })
}
