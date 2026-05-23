mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::AsrState::default())
        .manage(commands::LastForegroundState::default())
        .setup(|app| {
            let state = app.state::<commands::LastForegroundState>().inner().clone();
            commands::start_foreground_poller(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_settings,
            commands::save_settings,
            commands::load_history,
            commands::save_history,
            commands::copy_text,
            commands::insert_text,
            commands::set_window_mode,
            commands::asr_start,
            commands::asr_append_audio,
            commands::asr_stop,
            commands::asr_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri application");
}
