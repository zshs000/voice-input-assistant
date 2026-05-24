use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings as EnigoSettings};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    http::HeaderValue,
    protocol::Message,
};

#[cfg(windows)]
use windows::Win32::{
    Foundation::HWND,
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, SetWindowPos,
        HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    },
};

const DEFAULT_DASHSCOPE_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
const DEFAULT_DASHSCOPE_MODEL: &str = "qwen3-asr-flash-realtime";
const TRANSCRIPTION_EVENT: &str = "asr-transcription";
const FOREGROUND_POLL_MS: u64 = 250;
const FOCUS_RESTORE_DELAY_MS: u64 = 80;

#[derive(Default, Clone)]
pub struct LastForegroundState(pub Arc<StdMutex<Option<isize>>>);

#[derive(Default)]
pub struct AsrState {
    inner: Mutex<Option<AsrSession>>,
}

struct AsrSession {
    write_tx: mpsc::UnboundedSender<Message>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum TranscriptionEvent {
    Delta { text: String },
    Completed { text: String },
    Error { message: String },
    SessionFinished,
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

fn copy_to_clipboard(text: &str) -> Result<(), String> {
    Clipboard::new()
        .map_err(|error| format!("failed to access clipboard: {error}"))?
        .set_text(text.to_string())
        .map_err(|error| format!("failed to write clipboard: {error}"))
}

#[cfg(windows)]
pub fn start_foreground_poller(state: LastForegroundState) {
    tauri::async_runtime::spawn(async move {
        let self_pid = unsafe { GetCurrentProcessId() };
        loop {
            tokio::time::sleep(Duration::from_millis(FOREGROUND_POLL_MS)).await;
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.0.is_null() {
                continue;
            }
            let mut pid: u32 = 0;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
            if pid == 0 || pid == self_pid {
                continue;
            }
            if let Ok(mut guard) = state.0.lock() {
                *guard = Some(hwnd.0 as isize);
            }
        }
    });
}

#[cfg(not(windows))]
pub fn start_foreground_poller(_state: LastForegroundState) {
    // 仅 Windows 平台需要轮询前台窗口
}

#[cfg(windows)]
fn simulate_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&EnigoSettings::default())
        .map_err(|error| format!("键盘模拟初始化失败：{error}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|error| format!("Ctrl 按下失败：{error}"))?;
    let v_result = enigo.key(Key::Unicode('v'), Direction::Click);
    let release_result = enigo.key(Key::Control, Direction::Release);
    v_result.map_err(|error| format!("V 输入失败：{error}"))?;
    release_result.map_err(|error| format!("Ctrl 释放失败：{error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn insert_text(
    text: String,
    state: State<'_, LastForegroundState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }

    copy_to_clipboard(&text)?;

    #[cfg(windows)]
    {
        let target_raw = {
            let guard = state
                .0
                .lock()
                .map_err(|_| "前台窗口状态锁损坏".to_string())?;
            *guard
        };

        let Some(raw) = target_raw else {
            return Err("尚未捕获到上一个外部窗口；结果已复制到剪贴板，请手动粘贴。".into());
        };

        let hwnd = HWND(raw as *mut _);
        let activated = unsafe { SetForegroundWindow(hwnd) }.as_bool();
        if !activated {
            return Err("无法切回目标窗口；结果已复制到剪贴板，请手动粘贴。".into());
        }

        tokio::time::sleep(Duration::from_millis(FOCUS_RESTORE_DELAY_MS)).await;

        tokio::task::spawn_blocking(simulate_paste)
            .await
            .map_err(|error| format!("插入任务调度失败：{error}"))??;

        // 把自己窗口提回普通 z-order 顶部但不抢焦点，避免被工具窗口规则推到最底层
        if let Ok(self_hwnd) = window.hwnd() {
            let raw_self = self_hwnd.0 as isize;
            unsafe {
                let _ = SetWindowPos(
                    HWND(raw_self as *mut _),
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = state;
        let _ = window;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_window_mode(
    mode: String,
    always_on_top: Option<bool>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    let (size, decorations, default_on_top, skip_taskbar, resizable) = match mode.as_str() {
        "compact" => (LogicalSize::new(280.0, 160.0), false, true, true, false),
        "spirit" => (LogicalSize::new(220.0, 220.0), false, true, true, false),
        "full" => (LogicalSize::new(1120.0, 760.0), true, false, false, true),
        other => return Err(format!("未知窗口模式：{other}")),
    };

    let on_top = if mode == "compact" || mode == "spirit" {
        always_on_top.unwrap_or(default_on_top)
    } else {
        false
    };

    window
        .set_size(Size::Logical(size))
        .map_err(|error| format!("调整窗口大小失败：{error}"))?;
    window
        .set_decorations(decorations)
        .map_err(|error| format!("调整窗口边框失败：{error}"))?;
    window
        .set_always_on_top(on_top)
        .map_err(|error| format!("调整置顶失败：{error}"))?;
    window
        .set_skip_taskbar(skip_taskbar)
        .map_err(|error| format!("调整任务栏可见性失败：{error}"))?;
    window
        .set_resizable(resizable)
        .map_err(|error| format!("调整窗口可调整大小失败：{error}"))?;
    window
        .center()
        .map_err(|error| format!("窗口居中失败：{error}"))?;

    Ok(())
}

fn new_event_id() -> String {
    format!("event_{}", uuid::Uuid::new_v4().simple())
}

fn build_session_update(language: &str) -> Value {
    json!({
        "event_id": new_event_id(),
        "type": "session.update",
        "session": {
            "modalities": ["text"],
            "input_audio_format": "pcm",
            "sample_rate": 16000,
            "input_audio_transcription": { "language": language },
            "turn_detection": null,
        }
    })
}

fn extract_transcript(value: &Value) -> Option<String> {
    for key in ["transcript", "text", "delta"] {
        if let Some(text) = value.get(key).and_then(|v| v.as_str()) {
            return Some(text.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn asr_start(
    api_key: String,
    endpoint: String,
    model: String,
    language: String,
    app: AppHandle,
    state: State<'_, AsrState>,
) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("未配置 DashScope API Key。".into());
    }

    let mut guard = state.inner.lock().await;
    if guard.is_some() {
        return Err("已有正在进行中的 ASR 会话。".into());
    }

    let base = if endpoint.trim().is_empty() {
        DEFAULT_DASHSCOPE_ENDPOINT.to_string()
    } else {
        endpoint.trim().to_string()
    };
    let model = if model.trim().is_empty() {
        DEFAULT_DASHSCOPE_MODEL.to_string()
    } else {
        model.trim().to_string()
    };
    let url = format!("{base}?model={model}");

    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|error| format!("构造 WebSocket 请求失败：{error}"))?;
    let auth_value = HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))
        .map_err(|error| format!("API Key 含非法字符：{error}"))?;
    let beta_value = HeaderValue::from_static("realtime=v1");
    request.headers_mut().insert("Authorization", auth_value);
    request.headers_mut().insert("OpenAI-Beta", beta_value);

    let (ws_stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|error| format!("WebSocket 连接失败：{error}"))?;

    let (mut write, mut read) = ws_stream.split();
    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Message>();

    let session_update = build_session_update(language.trim());
    write_tx
        .send(Message::Text(session_update.to_string()))
        .map_err(|error| format!("排入 session.update 失败：{error}"))?;

    let writer_app = app.clone();
    tokio::spawn(async move {
        while let Some(message) = write_rx.recv().await {
            if let Err(error) = write.send(message).await {
                let _ = writer_app.emit(
                    TRANSCRIPTION_EVENT,
                    TranscriptionEvent::Error {
                        message: format!("WebSocket 发送失败：{error}"),
                    },
                );
                break;
            }
        }
        let _ = write.close().await;
    });

    let reader_app = app.clone();
    tokio::spawn(async move {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let Ok(value) = serde_json::from_str::<Value>(&text) else {
                        continue;
                    };
                    let event_type = value
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    match event_type.as_str() {
                        "conversation.item.input_audio_transcription.text"
                        | "conversation.item.input_audio_transcription.delta" => {
                            if let Some(text) = extract_transcript(&value) {
                                let _ = reader_app.emit(
                                    TRANSCRIPTION_EVENT,
                                    TranscriptionEvent::Delta { text },
                                );
                            }
                        }
                        "conversation.item.input_audio_transcription.completed" => {
                            if let Some(text) = extract_transcript(&value) {
                                let _ = reader_app.emit(
                                    TRANSCRIPTION_EVENT,
                                    TranscriptionEvent::Completed { text },
                                );
                            }
                        }
                        "session.finished" => {
                            let _ = reader_app
                                .emit(TRANSCRIPTION_EVENT, TranscriptionEvent::SessionFinished);
                            break;
                        }
                        "error" => {
                            let message = value
                                .get("error")
                                .and_then(|e| e.get("message"))
                                .and_then(|m| m.as_str())
                                .unwrap_or("ASR 服务端报错")
                                .to_string();
                            let _ = reader_app
                                .emit(TRANSCRIPTION_EVENT, TranscriptionEvent::Error { message });
                        }
                        _ => {}
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(error) => {
                    let _ = reader_app.emit(
                        TRANSCRIPTION_EVENT,
                        TranscriptionEvent::Error {
                            message: format!("WebSocket 接收失败：{error}"),
                        },
                    );
                    break;
                }
                _ => {}
            }
        }
        let state = reader_app.state::<AsrState>();
        let mut guard = state.inner.lock().await;
        *guard = None;
    });

    *guard = Some(AsrSession { write_tx });
    Ok(())
}

#[tauri::command]
pub async fn asr_append_audio(
    audio_b64: String,
    state: State<'_, AsrState>,
) -> Result<(), String> {
    let guard = state.inner.lock().await;
    let session = guard
        .as_ref()
        .ok_or_else(|| "ASR 会话未启动。".to_string())?;

    let event = json!({
        "event_id": new_event_id(),
        "type": "input_audio_buffer.append",
        "audio": audio_b64,
    });
    session
        .write_tx
        .send(Message::Text(event.to_string()))
        .map_err(|_| "WebSocket 连接已关闭。".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn asr_stop(state: State<'_, AsrState>) -> Result<(), String> {
    let guard = state.inner.lock().await;
    let Some(session) = guard.as_ref() else {
        return Ok(());
    };

    let commit = json!({
        "event_id": new_event_id(),
        "type": "input_audio_buffer.commit",
    });
    let finish = json!({
        "event_id": new_event_id(),
        "type": "session.finish",
    });
    let _ = session.write_tx.send(Message::Text(commit.to_string()));
    let _ = session.write_tx.send(Message::Text(finish.to_string()));
    Ok(())
}

#[tauri::command]
pub async fn asr_cancel(state: State<'_, AsrState>) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    *guard = None;
    Ok(())
}
