# 语音输入助手技术方案

## 技术栈

| 层级 | 当前实现 |
| --- | --- |
| 桌面壳 | Tauri 2 |
| 前端 | React 18 + TypeScript + Vite |
| 前端状态 | React 本地 state 和 service/domain 模块 |
| 后端 | Rust Tauri commands |
| 语音采集 | Web Audio API + AudioWorklet，16 kHz Int16 PCM |
| ASR | DashScope Qwen-ASR Realtime WebSocket，Mock 兜底模式 |
| LLM | OpenAI-compatible Chat Completions |
| 本地数据 | Rust 读写 app data 目录下的 JSON 文件 |
| 剪贴板/插入 | `arboard` 写剪贴板，Windows 下 `enigo` 模拟粘贴 |
| 快捷键 | `@tauri-apps/plugin-global-shortcut` |
| 测试 | Vitest + React Testing Library，Rust 当前以 `cargo check` 为主 |

## 代码结构

```text
src/
  App.tsx                 # 主界面和当前工作流编排
  domain/                 # 模板、设置、历史、录音阈值、LLM 请求等纯逻辑
  services/               # Tauri bridge、ASR bridge、PCM 录音、窗口模式
  test/                   # Vitest 测试设置
src-tauri/
  src/commands.rs         # Tauri commands、ASR WebSocket、剪贴板/插入/窗口能力
  src/lib.rs              # Tauri builder、插件、状态和 command 注册
  capabilities/default.json
public/pcm-worklet.js     # AudioWorklet PCM 分块处理器
docs/
  archive/                # 旧计划/交接/agent 记录
```

## 前端流程

`App.tsx` 负责串联当前主流程：

1. 读取本地设置和历史记录。
2. 注册全局快捷键。
3. 根据 STT Provider 开始录音：
   - `mock`：不采集麦克风，结束后返回固定中文文本。
   - `dashscope`：创建 `PcmRecorder`，音频分块通过 Tauri command 发往 Rust。
4. 等待最终识别文本。
5. 根据模板决定是否调用 LLM。
6. 按输出模式复制或插入文本。
7. 写入历史记录。

可测试逻辑被拆到 `src/domain` 和 `src/services`，UI 级测试覆盖主界面和设置弹窗的基础可见性。

## Tauri Command 边界

当前注册的命令：

- `load_settings`
- `save_settings`
- `load_history`
- `save_history`
- `copy_text`
- `insert_text`
- `set_window_mode`
- `asr_start`
- `asr_append_audio`
- `asr_stop`
- `asr_cancel`

前端只通过 service 模块调用这些命令，浏览器开发模式下提供 localStorage 和 Clipboard API 兜底。

## 本地数据

Rust 使用 Tauri app data 目录保存：

- `settings.json`
- `history.json`

历史记录 schema：

```ts
type HistoryItem = {
  id: string;
  recognizedText: string;
  finalText: string;
  templateId: string;
  status: "completed" | "failed";
  createdAt: string;
};
```

历史记录只保存文本，不保存音频。

## ASR 实现

DashScope 路径：

1. 前端创建 16 kHz `AudioContext`。
2. `public/pcm-worklet.js` 把 Float32 mono 输入转换为 Int16 LE。
3. 前端把 PCM bytes 转成 base64，通过 `asr_append_audio` 发送。
4. Rust 后端维护一个 WebSocket session。
5. Rust 把 delta/completed/error/session_finished 事件发回前端。

默认 endpoint 和 model：

```text
wss://dashscope.aliyuncs.com/api-ws/v1/realtime
qwen3-asr-flash-realtime
```

## LLM 实现

`src/domain/llm.ts` 构造 OpenAI-compatible `/chat/completions` 请求：

- `model`
- `temperature`
- `stream: false`
- system/user messages

如果 LLM 未配置或请求失败，当前流程保留原始识别文本作为最终输出。

## 输出与窗口

- `copy_text` 使用 `arboard` 写剪贴板。
- `insert_text` 先写剪贴板，再尝试切回最近的外部前台窗口并模拟 `Ctrl+V`。
- 后端轮询记录最近外部窗口，用于自动插入时恢复焦点。
- `set_window_mode` 支持 `full`、`compact`、`spirit` 三种窗口模式。

## 安全与隐私边界

- API Key 不写死在源码里。
- 历史记录不保存音频。
- 输出失败时优先保留文本。
- 当前未实现密钥加密存储，设置 JSON 位于本机 app data 目录，应在后续版本评估加密或系统密钥环。

## 验证命令

```powershell
npm run typecheck
npm test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

Tauri 打包可用：

```powershell
npm run tauri build
```

当前 `tauri.conf.json` 中 `bundle.active` 为 `false`，因此默认目标是生成可运行程序，不生成安装包。
