use std::{fs, path::PathBuf, time::Instant};

use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct RecordingState {
    started_at: std::sync::Mutex<Option<Instant>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopRecordingResult {
    audio_ref: String,
    duration_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechRecognitionResult {
    text: String,
    duration_ms: Option<u128>,
    provider: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    id: String,
    recognized_text: String,
    final_text: String,
    template_id: String,
    status: String,
    created_at: String,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create app data dir: {error}"))?;

    Ok(dir)
}

fn read_json_file(path: PathBuf, fallback: Value) -> Result<Value, String> {
    if !path.exists() {
        return Ok(fallback);
    }

    let content =
        fs::read_to_string(&path).map_err(|error| format!("failed to read {:?}: {error}", path))?;
    serde_json::from_str(&content).map_err(|error| format!("failed to parse {:?}: {error}", path))
}

fn write_json_file(path: PathBuf, value: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize json: {error}"))?;
    fs::write(&path, content).map_err(|error| format!("failed to write {:?}: {error}", path))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Value, String> {
    read_json_file(data_dir(&app)?.join("settings.json"), json!({}))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    write_json_file(data_dir(&app)?.join("settings.json"), &settings)
}

#[tauri::command]
pub fn load_history(app: AppHandle) -> Result<Vec<HistoryItem>, String> {
    let value = read_json_file(data_dir(&app)?.join("history.json"), json!([]))?;
    serde_json::from_value(value).map_err(|error| format!("failed to decode history: {error}"))
}

#[tauri::command]
pub fn save_history(app: AppHandle, history: Vec<HistoryItem>) -> Result<(), String> {
    let value = serde_json::to_value(history)
        .map_err(|error| format!("failed to encode history: {error}"))?;
    write_json_file(data_dir(&app)?.join("history.json"), &value)
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    Clipboard::new()
        .map_err(|error| format!("failed to access clipboard: {error}"))?
        .set_text(text)
        .map_err(|error| format!("failed to write clipboard: {error}"))
}

#[tauri::command]
pub fn insert_text(text: String) -> Result<(), String> {
    copy_text(text)
}

#[tauri::command]
pub fn start_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    let mut started_at = state
        .started_at
        .lock()
        .map_err(|_| "recording state lock poisoned".to_string())?;
    *started_at = Some(Instant::now());
    Ok(())
}

#[tauri::command]
pub fn stop_recording(state: State<'_, RecordingState>) -> Result<StopRecordingResult, String> {
    let mut started_at = state
        .started_at
        .lock()
        .map_err(|_| "recording state lock poisoned".to_string())?;
    let duration_ms = started_at.take().map(|instant| instant.elapsed().as_millis()).unwrap_or(0);

    Ok(StopRecordingResult {
        audio_ref: format!("mock-audio-{duration_ms}"),
        duration_ms,
    })
}

#[tauri::command]
pub fn recognize_speech(audio_ref: String) -> Result<SpeechRecognitionResult, String> {
    Ok(SpeechRecognitionResult {
        text: format!("这是一个模拟语音识别结果，来源音频引用：{audio_ref}。"),
        duration_ms: None,
        provider: "mock".to_string(),
    })
}
