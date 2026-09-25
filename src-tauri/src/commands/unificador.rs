//! Comando Tauri para el Unificador de Olas (SPSS .sav).
//!
//! Flujo:
//!   1. React llama a `run_unificador` o `preview_unificador`.
//!   2. Rust spawnea `python.exe run_unificador.py` con streaming de progreso.
//!   3. Al terminar, parsea la última línea JSON de stdout.

use std::path::{Path, PathBuf};

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::python_bridge::{run_python_script, PythonBridgeError, PythonRunOptions};

pub const PROGRESS_EVENT: &str = "unificador-progress";

const ROOT_FOLDER_NAME: &str = "MegaApp";
const STUDY_FOLDER_NAME: &str = "Unificador Olas";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnificadorParams {
    pub madre: String,
    pub parcial: String,
    pub wave: i64,
    /// Si se omite, Rust elige una carpeta timestamp bajo Documents\MegaApp.
    #[serde(default)]
    pub output_dir: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnificadorResult {
    pub ok: bool,
    pub output_path: Option<String>,
    pub mrsets_path: Option<String>,
    pub wave: Option<i64>,
    pub wave_label: Option<String>,
    pub rows_total: Option<i64>,
    pub rows_wave: Option<i64>,
    pub alerts: Vec<String>,
    pub empty_derived: Vec<String>,
    pub align: Option<Value>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnificadorPreviewParams {
    pub madre: String,
    #[serde(default)]
    pub parcial: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum UnificadorError {
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
    #[error("Tauri: {0}")]
    Tauri(#[from] tauri::Error),
}

impl serde::Serialize for UnificadorError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

fn mega_app_root(app: &AppHandle) -> Result<PathBuf, UnificadorError> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| UnificadorError::NoDocumentsDir)?;
    let root = documents.join(ROOT_FOLDER_NAME);
    if !root.exists() {
        std::fs::create_dir_all(&root)?;
    }
    Ok(root)
}

fn build_output_dir(root: &Path) -> Result<PathBuf, UnificadorError> {
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let out = root.join(STUDY_FOLDER_NAME).join(timestamp);
    std::fs::create_dir_all(&out)?;
    Ok(out)
}

fn parse_last_json_line(stdout: &str) -> Option<Value> {
    stdout.lines().rev().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            None
        } else {
            serde_json::from_str::<Value>(trimmed).ok()
        }
    })
}

fn json_string(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(|s| s.to_string())
}

fn json_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64().or_else(|| x.as_f64().map(|f| f as i64)))
}

fn json_string_vec(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn preview_unificador(
    app: AppHandle,
    params: UnificadorPreviewParams,
) -> Result<Value, UnificadorError> {
    if params.madre.trim().is_empty() {
        return Err(UnificadorError::InvalidParam("madre está vacío".into()));
    }
    let madre = params.madre.trim().to_string();
    let mut args: Vec<&str> = vec!["--preview-only", "--madre", &madre];
    let parcial_owned: String;
    if let Some(p) = params.parcial.as_ref() {
        if !p.trim().is_empty() {
            parcial_owned = p.trim().to_string();
            args.push("--parcial");
            args.push(&parcial_owned);
        }
    }

    let opts = PythonRunOptions {
        stream_event: None,
        timeout_secs: Some(120),
        track_for_cancel: false,
        ..Default::default()
    };
    let py_out = run_python_script(&app, "run_unificador.py", &args, opts).await?;
    let Some(final_json) = parse_last_json_line(&py_out.stdout) else {
        return Err(UnificadorError::BadPythonOutput(py_out.stdout));
    };
    Ok(final_json)
}

#[tauri::command]
pub async fn run_unificador(
    app: AppHandle,
    params: UnificadorParams,
) -> Result<UnificadorResult, UnificadorError> {
    if params.madre.trim().is_empty() {
        return Err(UnificadorError::InvalidParam("madre está vacío".into()));
    }
    if params.parcial.trim().is_empty() {
        return Err(UnificadorError::InvalidParam("parcial está vacío".into()));
    }
    if params.wave <= 0 {
        return Err(UnificadorError::InvalidParam("wave inválido".into()));
    }

    let madre = params.madre.trim().to_string();
    let parcial = params.parcial.trim().to_string();
    let wave_str = params.wave.to_string();

    let output_dir = if let Some(ref d) = params.output_dir {
        if !d.trim().is_empty() {
            let p = PathBuf::from(d.trim());
            std::fs::create_dir_all(&p)?;
            p
        } else {
            build_output_dir(&mega_app_root(&app)?)?
        }
    } else {
        build_output_dir(&mega_app_root(&app)?)?
    };

    // Nombre de salida: stem de la madre + _wNN.sav (nunca el mismo path).
    let madre_stem = Path::new(&madre)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unificada");
    let out_name = format!("{madre_stem}_w{}.sav", params.wave);
    let output_path = output_dir.join(out_name);
    let output_path_str = output_path.to_string_lossy().to_string();

    if output_path == PathBuf::from(&madre) {
        return Err(UnificadorError::InvalidParam(
            "el archivo de salida no puede ser la madre".into(),
        ));
    }

    let args: Vec<&str> = vec![
        "--madre",
        &madre,
        "--parcial",
        &parcial,
        "--wave",
        &wave_str,
        "--output",
        &output_path_str,
    ];

    let opts = PythonRunOptions {
        stream_event: Some(PROGRESS_EVENT.to_string()),
        timeout_secs: Some(7200),
        track_for_cancel: true,
        cwd: Some(output_dir.clone()),
        ..Default::default()
    };

    let py_out = run_python_script(&app, "run_unificador.py", &args, opts).await?;
    let Some(final_json) = parse_last_json_line(&py_out.stdout) else {
        return Err(UnificadorError::BadPythonOutput(py_out.stdout));
    };

    let ok = final_json
        .get("ok")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if !ok {
        let msg = final_json
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Error desconocido del unificador")
            .to_string();
        return Err(UnificadorError::BadPythonOutput(format!(
            "Unificador falló: {msg}\n\nStdout:\n{}\n\nStderr:\n{}",
            py_out.stdout, py_out.stderr
        )));
    }

    Ok(UnificadorResult {
        ok: true,
        output_path: json_string(&final_json, "output_path"),
        mrsets_path: json_string(&final_json, "mrsets_path"),
        wave: json_i64(&final_json, "wave"),
        wave_label: json_string(&final_json, "wave_label"),
        rows_total: json_i64(&final_json, "rows_total"),
        rows_wave: json_i64(&final_json, "rows_wave"),
        alerts: json_string_vec(&final_json, "alerts"),
        empty_derived: json_string_vec(&final_json, "empty_derived"),
        align: final_json.get("align").cloned(),
        stdout: py_out.stdout,
        stderr: py_out.stderr,
    })
}
