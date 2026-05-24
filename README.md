# Voice Input Assistant

Windows 桌面语音输入助手。应用通过 Tauri + React 提供录音、中文识别、AI 润色、剪贴板输出、自动插入和历史记录能力。

## 当前状态

- 桌面框架：Tauri 2。
- 前端：React + TypeScript + Vite。
- ASR：DashScope Qwen-ASR Realtime WebSocket，另有 Mock 模式。
- LLM：OpenAI-compatible Chat Completions。
- 数据：本地 JSON 保存设置和文本历史。
- 输出：复制到剪贴板，或 Windows 下尝试切回目标窗口并模拟粘贴。

## 开发命令

```powershell
npm install
npm run typecheck
npm test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

启动开发：

```powershell
npm run dev
npm run tauri dev
```

构建桌面程序：

```powershell
npm run tauri build
```

当前安装包打包关闭，`tauri.conf.json` 中 `bundle.active=false`。

## 使用说明

1. 打开应用。
2. 进入设置，选择 STT Provider。
3. 使用 DashScope 时填写 API Key、model、language；无外部服务时可切换到 Mock。
4. 配置 LLM Base URL、API Key、model 和 temperature；未配置 LLM 时会保留原始识别文本。
5. 选择润色模板和输出方式。
6. 点击录音按钮，或使用全局快捷键开始/结束录音。

## 文档

- `docs/product-design.md`：当前产品能力、场景和限制。
- `docs/technical-design.md`：当前实现架构、Tauri command、数据和验证命令。
- `docs/prompt-templates.md`：内置模板、自定义模板和 LLM 请求格式。
- `PROJECT_REVIEW.md`：项目审查意见。
- `docs/archive/`：过期计划和交接材料。
