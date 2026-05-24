# Findings

## Current Task

The current goal is a project-wide review and cleanup, not the earlier MVP implementation task.

Required outputs:

- Accurate project understanding from current files.
- Documentation cleanup, including archiving outdated or unnecessary docs.
- Rewriting important docs whose content no longer matches the project.
- Low-risk code cleanup where appropriate.
- Root-level review opinion document.

## Repository State

- Current worktree contains a Tauri 2 + React + TypeScript desktop app.
- Frontend package scripts include `dev`, `build`, `preview`, `test`, and `tauri`.
- Rust backend package is `voice-input-assistant`, version `0.1.0`.
- Git status initially shows `.gitignore` modified.
- `docs/development-plan.md` and `docs/handoff.md` exist in `docs`, but did not appear in `rg --files`; likely ignored or untracked.

## Implementation Facts

- Frontend app is currently centered in `src/App.tsx` with local React state.
- Tauri bridge lives in `src/services/tauri.ts`.
- Browser fallback uses `localStorage` and `navigator.clipboard`.
- Real ASR path uses `src/services/recorder.ts` for 16 kHz PCM capture and `src/services/asr.ts` for Tauri event/invoke bridging.
- Rust backend exposes settings/history JSON persistence, clipboard copy, best-effort insert, window mode, and DashScope WebSocket ASR commands in `src-tauri/src/commands.rs`.
- Tauri capability file allows core window/event/path and global-shortcut permissions.
- Bundle packaging is disabled in `tauri.conf.json`; release build can still produce the executable through Tauri build.

## Documentation Mismatches Found

- `docs/technical-design.md` still describes Recoil, but the implementation uses local React state.
- `docs/technical-design.md` lists old command names such as `start_recording`, `recognize_speech`, and `copy_to_clipboard`; actual commands are `load_settings`, `save_settings`, `load_history`, `save_history`, `copy_text`, `insert_text`, `set_window_mode`, `asr_start`, `asr_append_audio`, `asr_stop`, and `asr_cancel`.
- `docs/technical-design.md` describes Tauri Store and clipboard-manager, while current implementation uses Rust JSON files, `arboard`, and `enigo`.
- `docs/product-design.md` says the first version uses non-streaming recognition, while current code sends PCM chunks to DashScope realtime WebSocket.
- `docs/development-plan.md`, `docs/handoff.md`, and `docs/superpowers/plans/2026-05-23-voice-input-assistant-mvp.md` are phase/agent artifacts, not current project documentation.

## Baseline Verification

- `npm test`: passed 10 files / 39 tests.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri\Cargo.toml`: passed.

## Code Cleanup Applied

- Added `npm run typecheck` script.
- Fixed `normalizeSettings({})` STT provider fallback so missing provider uses `DEFAULT_SETTINGS.stt.provider`; unknown provider values still fall back to `mock`.
