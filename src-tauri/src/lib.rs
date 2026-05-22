mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_settings,
            commands::save_settings,
            commands::load_history,
            commands::save_history,
            commands::copy_text,
            commands::insert_text,
            commands::start_recording,
            commands::stop_recording,
            commands::recognize_speech,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri application");
}
