//! Entry point de la lib de Tauri. Registra plugins y comandos.

mod commands;
mod python_bridge;

// PAT de GitHub inyectado en build-time para acceder a releases del repo privado.
// Si no se setea la env var en tiempo de compilación, queda vacío y el updater
// solo va a poder chequear contra repos públicos. En dev/local es normal que
// esté vacío; en CI viene del secret `UPDATER_GITHUB_TOKEN`.
const UPDATER_GITHUB_TOKEN: Option<&str> = option_env!("UPDATER_GITHUB_TOKEN");

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Builder del plugin updater: si tenemos PAT, lo inyectamos como header
    // `Authorization: Bearer ...` para poder bajar assets de releases privados.
    let updater_builder = {
        let mut builder = tauri_plugin_updater::Builder::new();
        if let Some(token) = UPDATER_GITHUB_TOKEN {
            if !token.is_empty() {
                builder = builder
                    .header("Authorization", format!("Bearer {}", token))
                    .expect("header Authorization válido")
                    .header("Accept", "application/octet-stream")
                    .expect("header Accept válido");
            }
        }
        builder
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::python::run_python_hello,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
