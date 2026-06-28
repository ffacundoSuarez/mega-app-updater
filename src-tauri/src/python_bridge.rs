//! Puente Rust ↔ sidecar Python.
//!
//! Responsabilidades:
//!   - Resolver la ruta a `python.exe` y a los scripts empaquetados como
//!     bundle resources (ver `tauri.conf.json` → `bundle.resources`).
//!   - Ejecutar un script con args, env vars, cwd, y opcionalmente streamear
//!     stdout/stderr como eventos Tauri para que la UI muestre progreso.
//!   - Timeout y cancelación del subproceso en modo streaming.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;
use tokio::time::timeout;

const PYTHON_RUNTIME_DIR: &str = "python-runtime";
const PYTHON_SCRIPTS_DIR: &str = "python-scripts";
const PYTHON_EXECUTABLE: &str = "python.exe";

static ACTIVE_PYTHON_CHILD: Mutex<Option<CommandChild>> = Mutex::new(None);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

const DEFAULT_STREAM_TIMEOUT_SECS: u64 = 7200;

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

    #[error("El script '{script}' superó el tiempo límite ({timeout_secs}s).")]
    TimedOut { script: String, timeout_secs: u64 },

    #[error("El script '{script}' fue cancelado.")]
    Cancelled { script: String },
}

impl Serialize for PythonBridgeError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct PythonOutput {
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Default)]
pub struct PythonRunOptions {
    pub env: HashMap<String, String>,
    pub cwd: Option<PathBuf>,
    pub stream_event: Option<String>,
    pub timeout_secs: Option<u64>,
    pub track_for_cancel: bool,
}

/// Mata el subproceso Python en curso (si hay uno). Idempotente.
pub fn cancel_active_python_sidecar() -> Result<(), String> {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    let mut guard = ACTIVE_PYTHON_CHILD
        .lock()
        .map_err(|e| format!("lock sidecar: {e}"))?;
    if let Some(child) = guard.take() {
        child
            .kill()
            .map_err(|e| format!("No se pudo cancelar el sidecar: {e}"))?;
    }
    Ok(())
}

fn clear_active_child() {
    if let Ok(mut guard) = ACTIVE_PYTHON_CHILD.lock() {
        *guard = None;
    }
}

pub async fn run_python_script(
    app: &AppHandle,
    script_name: &str,
    args: &[&str],
    opts: PythonRunOptions,
) -> Result<PythonOutput, PythonBridgeError> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    let python_exe: PathBuf = app.path().resolve(
        format!("{PYTHON_RUNTIME_DIR}/{PYTHON_EXECUTABLE}"),
        BaseDirectory::Resource,
    )?;
    if !python_exe.exists() {
        return Err(PythonBridgeError::PythonNotBundled { path: python_exe });
    }

    let script_path: PathBuf = app.path().resolve(
        format!("{PYTHON_SCRIPTS_DIR}/{script_name}"),
        BaseDirectory::Resource,
    )?;
    if !script_path.exists() {
        return Err(PythonBridgeError::ScriptNotFound {
            script: script_name.to_string(),
        });
    }

    let mut cmd_args: Vec<String> = vec![script_path.to_string_lossy().into_owned()];
    cmd_args.extend(args.iter().map(|s| s.to_string()));

    let mut cmd = app
        .shell()
        .command(python_exe.to_string_lossy().as_ref())
        .args(cmd_args);

    cmd = cmd.env("PYTHONIOENCODING", "utf-8");
    cmd = cmd.env("PYTHONUTF8", "1");

    if !opts.env.is_empty() {
        cmd = cmd.envs(&opts.env);
    }
    if let Some(cwd) = opts.cwd.as_ref() {
        cmd = cmd.current_dir(cwd.clone());
    }

    if let Some(event_name) = opts.stream_event.as_ref() {
        let (mut rx, child) = cmd
            .spawn()
            .map_err(|e| PythonBridgeError::Spawn(e.to_string()))?;

        if opts.track_for_cancel {
            if let Ok(mut guard) = ACTIVE_PYTHON_CHILD.lock() {
                *guard = Some(child);
            }
        }

        let timeout_secs = opts.timeout_secs.unwrap_or(DEFAULT_STREAM_TIMEOUT_SECS);
        let script_owned = script_name.to_string();
        let event_name = event_name.clone();
        let app = app.clone();

        let run_result = timeout(Duration::from_secs(timeout_secs), async move {
            let mut stdout_buf = String::new();
            let mut stderr_buf = String::new();
            let mut exit_code: i32 = -1;
            let mut errored = false;

            while let Some(event) = rx.recv().await {
                if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                    break;
                }
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let line = String::from_utf8_lossy(&bytes);
                        stdout_buf.push_str(&line);
                        stdout_buf.push('\n');
                        let _ = app.emit(
                            &event_name,
                            serde_json::json!({"stream": "stdout", "line": line.trim_end()}),
                        );
                    }
                    CommandEvent::Stderr(bytes) => {
                        let line = String::from_utf8_lossy(&bytes);
                        stderr_buf.push_str(&line);
                        stderr_buf.push('\n');
                        let _ = app.emit(
                            &event_name,
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

            (stdout_buf, stderr_buf, exit_code, errored)
        })
        .await;

        clear_active_child();

        if CANCEL_REQUESTED.swap(false, Ordering::SeqCst) {
            return Err(PythonBridgeError::Cancelled {
                script: script_owned,
            });
        }

        let (stdout_buf, stderr_buf, exit_code, errored) = match run_result {
            Err(_) => {
                let _ = cancel_active_python_sidecar();
                return Err(PythonBridgeError::TimedOut {
                    script: script_owned,
                    timeout_secs,
                });
            }
            Ok(tuple) => tuple,
        };

        if errored || exit_code != 0 {
            return Err(PythonBridgeError::NonZeroExit {
                script: script_owned,
                code: exit_code,
                stderr: stderr_buf,
            });
        }

        return Ok(PythonOutput {
            stdout: stdout_buf,
            stderr: stderr_buf,
        });
    }

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
