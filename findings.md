# Findings

## Current Task

The current goal is to split `src/App.tsx` without changing behavior.

Required outputs:

- Pure UI components under `src/components`.
- `App.tsx` remains the behavior container.
- Existing tests and builds remain green.

## Repository State

- Current worktree contains a Tauri 2 + React + TypeScript desktop app.
- Frontend package scripts include `dev`, `build`, `preview`, `test`, and `tauri`.
- Rust backend package is `voice-input-assistant`, version `0.1.0`.
- Git status was clean before starting the split.

## Implementation Facts

- Frontend app is currently centered in `src/App.tsx` with local React state.
- Tauri bridge lives in `src/services/tauri.ts`.
- Browser fallback uses `localStorage` and `navigator.clipboard`.
- Real ASR path uses `src/services/recorder.ts` for 16 kHz PCM capture and `src/services/asr.ts` for Tauri event/invoke bridging.
- Rust backend exposes settings/history JSON persistence, clipboard copy, best-effort insert, window mode, and DashScope WebSocket ASR commands in `src-tauri/src/commands.rs`.
- Tauri capability file allows core window/event/path and global-shortcut permissions.
- Bundle packaging is disabled in `tauri.conf.json`; release build can still produce the executable through Tauri build.
- `App.tsx` render branches are `spirit`, `compact`, and full main workspace.
- Current `App.test.tsx` asserts the main workspace renders and settings modal opens with expected fields.

## Split Boundaries

- `App.tsx`: state, effects, ASR/recording/output/history/settings handlers.
- `src/components/SpiritWindow.tsx`: spirit window markup.
- `src/components/CompactWindow.tsx`: compact window markup.
- `src/components/MainWorkspace.tsx`: full window main workspace markup.
- `src/components/SettingsModal.tsx`: settings modal markup.
- `src/components/appUi.ts`: shared status type and UI labels.
- `App.tsx` now stays focused on state/effects/recording/ASR/output/persistence/template handlers and renders the extracted components.

## Baseline Verification

- `npm run typecheck`: passed after component extraction.
- `npm test`: passed 10 files / 39 tests.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri\Cargo.toml`: passed.
