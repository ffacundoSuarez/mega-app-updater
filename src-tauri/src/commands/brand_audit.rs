//! Comando Tauri para correr el motor Brand Audit (YPF).
//!
//! Flujo completo:
//!   1. React llama a `run_brand_audit(params)` con paths de `.sav` + wave + toggles IA.
//!   2. Rust resuelve la carpeta de assets del usuario (Documents\MegaApp\assets\).
//!      Si los assets no existen, los copia desde los resources del MSI (primer run).
//!   3. Rust resuelve la carpeta de output (Documents\MegaApp\<study>\<timestamp>\).
//!   4. Rust spawnea `python.exe run_brand_audit.py <args>` con streaming de
//!      stdout/stderr como eventos Tauri ("brand-audit-progress") para que la UI
//!      muestre log en vivo.
//!   5. Al terminar, Rust parsea la última línea JSON de stdout y la devuelve
//!      como resultado.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::python_bridge::{run_python_script, PythonBridgeError, PythonRunOptions};

/// Nombre del estudio a nivel carpetas (hardcoded Fase 3 — un solo estudio).
const STUDY_FOLDER_NAME: &str = "YPF Monitor";
/// Carpeta raíz dentro de Documents del usuario.
const ROOT_FOLDER_NAME: &str = "MegaApp";
/// Subcarpeta fija con los assets del estudio (se copian en el primer run).
const ASSETS_FOLDER_NAME: &str = "assets";

/// Assets que vienen empaquetados en el MSI como resource y se copian a
/// `Documents\MegaApp\assets\` en el primer run. Si el usuario los edita
/// localmente, no los sobreescribimos (ver `copy_assets_if_missing`).
const BUNDLED_ASSETS: &[&str] = &[
    "brand_audit/assets/INFORME COMPLETO YPF MONITOR.pptx",
    "brand_audit/assets/cuestionario.xlsx",
    // manual_tasks.csv se agrega cuando nos lo pasen.
];

/// Nombre del evento Tauri que emitimos con cada línea de stdout/stderr del
/// sidecar. La UI se suscribe con `listen("brand-audit-progress", ...)`.
pub const PROGRESS_EVENT: &str = "brand-audit-progress";

/// Parámetros que manda el frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandAuditParams {
    /// Path absoluto al `.sav` principal (obligatorio).
    pub sav_principal: String,
    /// Path absoluto al `.sav` secundario (opcional).
    #[serde(default)]
    pub sav_secundario: Option<String>,
    /// Filtro de ola (número entero, ej. 48).
    pub wave_filter: i64,
    /// Nombre visible de la ola (ej. "Abr 26").
    pub wave_name: String,
    /// Si true, activa la IA de títulos. Requiere `gemini_api_key`.
    #[serde(default)]
    pub use_ai_insights: bool,
    /// Si true, activa el executive summary IA. Requiere `gemini_api_key`.
    #[serde(default)]
    pub use_ai_summary: bool,
    /// API key de Gemini. La recibimos por invoke (la UI la lee de
    /// tauri-plugin-store y la adjunta). Se propaga como env var al sidecar,
    /// nunca por argv.
    #[serde(default)]
    pub gemini_api_key: Option<String>,
}

/// Resultado que devolvemos al frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandAuditResult {
    pub ok: bool,
    pub output_dir: String,
    pub ppt: Option<String>,
    pub excel_principal: Option<String>,
    pub excel_secundario: Option<String>,
    pub log: Option<String>,
    pub study_id: Option<String>,
    /// Salida cruda de stdout (para debugging desde la UI si hace falta).
    pub stdout: String,
    /// Idem stderr.
    pub stderr: String,
}

/// Errores del comando Brand Audit. Se serializan como string al cruzar a JS.
#[derive(Debug, thiserror::Error)]
pub enum BrandAuditError {
    #[error("Parámetro inválido: {0}")]
    InvalidParam(String),

    #[error("No se pudo resolver el directorio Documents del usuario")]
    NoDocumentsDir,

    #[error("IO: {0}")]
    Io(#[from] std::io::Error),

    #[error("Bridge Python: {0}")]
    PythonBridge(#[from] PythonBridgeError),

    #[error("El sidecar no devolvió un JSON parseable. Stdout crudo:\n{0}")]
    BadPythonOutput(String),

    #[error("Resource del bundle faltante: {0}")]
    MissingResource(String),

    #[error("Tauri: {0}")]
    Tauri(#[from] tauri::Error),
}

impl serde::Serialize for BrandAuditError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Resuelve `%USERPROFILE%\Documents\MegaApp\` (crea si no existe).
fn mega_app_root(app: &AppHandle) -> Result<PathBuf, BrandAuditError> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| BrandAuditError::NoDocumentsDir)?;
    let root = documents.join(ROOT_FOLDER_NAME);
    if !root.exists() {
        fs::create_dir_all(&root)?;
    }
    Ok(root)
}

/// Copia los assets bundleados a `Documents\MegaApp\assets\` si falta alguno.
/// No sobreescribe archivos existentes (el usuario puede editar la plantilla
/// localmente sin que un update se la pise).
fn copy_assets_if_missing(
    app: &AppHandle,
    dest_assets_dir: &Path,
) -> Result<(), BrandAuditError> {
    if !dest_assets_dir.exists() {
        fs::create_dir_all(dest_assets_dir)?;
    }

    for resource_path in BUNDLED_ASSETS {
        let src: PathBuf = app
            .path()
            .resolve(format!("python-scripts/{}", resource_path), BaseDirectory::Resource)?;
        if !src.exists() {
            return Err(BrandAuditError::MissingResource(
                src.to_string_lossy().to_string(),
            ));
        }

        // Usamos el nombre de archivo final (sin el prefijo brand_audit/assets/).
        let file_name = Path::new(resource_path)
            .file_name()
            .ok_or_else(|| BrandAuditError::MissingResource(resource_path.to_string()))?;
        let dst = dest_assets_dir.join(file_name);

        if dst.exists() {
            continue; // no pisar edits del usuario
        }
        fs::copy(&src, &dst)?;
    }
    Ok(())
}

/// Genera una subcarpeta por run con timestamp (YYYY-MM-DD_HH-MM-SS).
fn build_output_dir(root: &Path, study_folder: &str) -> Result<PathBuf, BrandAuditError> {
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let out = root.join(study_folder).join(timestamp);
    fs::create_dir_all(&out)?;
    Ok(out)
}

/// Encuentra la última línea JSON válida de stdout (el script emite varias:
/// progreso + 1 línea final con el resultado). Nos interesa solo la última.
fn parse_last_json_line(stdout: &str) -> Option<Value> {
    stdout
        .lines()
        .rev()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                None
            } else {
                serde_json::from_str::<Value>(trimmed).ok()
            }
        })
}

#[tauri::command]
pub async fn run_brand_audit(
    app: AppHandle,
    params: BrandAuditParams,
) -> Result<BrandAuditResult, BrandAuditError> {
    // --- Validación básica -------------------------------------------------
    if params.sav_principal.trim().is_empty() {
        return Err(BrandAuditError::InvalidParam(
            "sav_principal está vacío".into(),
        ));
    }
    if params.wave_name.trim().is_empty() {
        return Err(BrandAuditError::InvalidParam("wave_name está vacío".into()));
    }

    // --- Resolver carpetas del usuario ------------------------------------
    let root = mega_app_root(&app)?;
    let assets_dir = root.join(ASSETS_FOLDER_NAME);
    copy_assets_if_missing(&app, &assets_dir)?;
    let output_dir = build_output_dir(&root, STUDY_FOLDER_NAME)?;

    // --- Armar args para el wrapper Python --------------------------------
    let wave_filter_str = params.wave_filter.to_string();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    let assets_dir_str = assets_dir.to_string_lossy().to_string();

    let mut args: Vec<&str> = vec![
        "--sav-principal",
        &params.sav_principal,
        "--wave-filter",
        &wave_filter_str,
        "--wave-name",
        &params.wave_name,
        "--output-dir",
        &output_dir_str,
        "--assets-dir",
        &assets_dir_str,
    ];
    if let Some(ref sec) = params.sav_secundario {
        if !sec.trim().is_empty() {
            args.push("--sav-secundario");
            args.push(sec);
        }
    }
    if params.use_ai_insights {
        args.push("--use-ai-insights");
    }
    if params.use_ai_summary {
        args.push("--use-ai-summary");
    }

    // --- Env vars (API key) ------------------------------------------------
    let mut env = HashMap::new();
    if let Some(key) = params.gemini_api_key.as_ref() {
        if !key.trim().is_empty() {
            env.insert("GEMINI_API_KEY".to_string(), key.trim().to_string());
        }
    }

    // --- Spawnear el sidecar con streaming ---------------------------------
    let opts = PythonRunOptions {
        env,
        cwd: Some(output_dir.clone()),
        stream_event: Some(PROGRESS_EVENT.to_string()),
    };
    let py_out = run_python_script(&app, "run_brand_audit.py", &args, opts).await?;

    // --- Parsear resultado -------------------------------------------------
    let Some(final_json) = parse_last_json_line(&py_out.stdout) else {
        return Err(BrandAuditError::BadPythonOutput(py_out.stdout));
    };

    let ok = final_json
        .get("ok")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // Si el wrapper dijo ok=false, devolvemos el error embebido.
    if !ok {
        let msg = final_json
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Error desconocido del motor")
            .to_string();
        return Err(BrandAuditError::BadPythonOutput(format!(
            "Motor falló: {msg}\n\nStdout completo:\n{}\n\nStderr:\n{}",
            py_out.stdout, py_out.stderr
        )));
    }

    // Extraemos los campos opcionales.
    let get_str = |k: &str| {
        final_json
            .get(k)
            .and_then(Value::as_str)
            .map(|s| s.to_string())
    };

    Ok(BrandAuditResult {
        ok: true,
        output_dir: get_str("output_dir").unwrap_or(output_dir_str),
        ppt: get_str("ppt"),
        excel_principal: get_str("excel_principal"),
        excel_secundario: get_str("excel_secundario"),
        log: get_str("log"),
        study_id: get_str("study_id"),
        stdout: py_out.stdout,
        stderr: py_out.stderr,
    })
}
