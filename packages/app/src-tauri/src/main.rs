// No console window behind the app in a release build on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// The demo app: its window is the Vite app in `packages/app`, with Donizetti's plugin for scores, the
/// soundfont and exports, and Tauri's dialog plugin for choosing files and asking before an overwrite.
#[expect(clippy::expect_used, reason = "the app cannot run if Tauri does not start")]
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_donizetti::init())
        .run(tauri::generate_context!())
        .expect("failed to run Donizetti");
}
