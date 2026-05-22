# Findings

## Existing Repository

- Current branch: `master`.
- Existing commits:
  - `docs: 添加代理协作约束`
  - `docs: 初始化语音输入助手设计文档`
- Existing docs:
  - `docs/product-design.md`
  - `docs/technical-design.md`
  - `docs/prompt-templates.md`
- User-side uncommitted change present before implementation:
  - `.gitignore` adds `docs/development-plan.md`.

## Product Requirements Extracted

- Windows desktop helper, not a traditional IME.
- Trigger via UI button and eventually hotkey.
- Record Chinese speech, recognize text, optionally polish via scene templates.
- Output via clipboard and optional automatic insertion.
- Store local settings and recent text history.
- Use OpenAI-compatible Chat Completions for polishing.
- Do not hardcode API keys in frontend code or logs.
- Audio is temporary only; history stores text, not raw audio.

## Technical Direction Extracted

- Tauri 2 desktop shell.
- Rust backend for system capabilities and local persistence.
- React + TypeScript frontend.
- Recoil was specified in docs, but implementation may use a simpler local React state store if that keeps MVP smaller unless dependency setup favors Recoil.
- Provider abstractions:
  - `SpeechRecognitionProvider`
  - `LlmProvider`

