//! Entry point de la lib de Tauri. Registra plugins y comandos.

mod commands;
mod python_bridge;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::python::run_python_hello,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
