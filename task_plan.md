# Voice Input Assistant MVP Task Plan

## Goal

Build a runnable Windows desktop MVP for the voice input assistant from the existing docs:

- Initialize a Tauri 2 + React + TypeScript desktop app.
- Provide the main desktop UI, recording entry, STT provider abstraction, LLM polishing, template management, settings persistence, history, clipboard output, and auto-insert exploration.
- Add focused baseline tests where practical.
- Commit in multiple logical steps using Chinese conventional commit messages.

## Current Constraints

- Work in the current checkout; `.gitignore` already had a user change before implementation started.
- Preserve user changes and avoid unrelated rewrites.
- Prefer runnable fallback behavior where real system capabilities are risky or environment-limited.

## Phases

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Planning files and baseline discovery | complete | `task_plan.md`, `findings.md`, `progress.md` |
| 2. Toolchain and scaffold strategy | complete | Node v25.2.1, npm 11.6.2, rustc/cargo 1.95.0 available |
| 3. Project initialization | complete | `npm test` passed 1/1, `npm run build` passed, `cargo check` passed |
| 4. Tested TypeScript domain core | complete | `npm test` passed 5 files / 12 tests, `npm run build` passed |
| 5. React UI MVP | complete | `npm test` passed 6 files / 16 tests, `npm run build` passed |
| 6. Tauri command bridge and Rust fallbacks | complete | `npm test` passed 6 files / 16 tests, `npm run build` passed, `cargo check` passed |
| 6.5. Custom templates and STT provider abstraction | complete | `npm test` passed 7 files / 19 tests, `npm run build` passed, `cargo check` passed |
| 7. Verification and commits | pending | `npm test`, `npm run build`, `cargo test`/Tauri build if available, git commits |
| 8. Completion audit | pending | Requirement-to-artifact checklist |

## Errors Encountered

| Time | Error | Resolution |
| --- | --- | --- |
| 2026-05-23 | `npm test` / `npm run build` failed with esbuild `spawn EPERM` while loading Vite config | Treat as sandbox process-spawn restriction; rerun verification with escalated permission |
| 2026-05-23 | `cargo check` failed because Cargo was in offline mode and `serde` was not cached | Rerun with escalated permission so crates can be resolved |
| 2026-05-23 | First escalated `cargo check` timed out after 184 seconds during initial dependency work | Rerun with a longer timeout |
| 2026-05-23 | `cargo check` then failed because Tauri Windows resource generation required `src-tauri/icons/icon.ico` | Added a minimal local ICO resource and reran successfully |
| 2026-05-23 | `npm run build` failed because `String.replaceAll` is not in the ES2020 lib target | Replaced with `split(...).join(...)` and reran tests/build successfully |
| 2026-05-23 | New service tests failed because Vitest/jsdom exposed a non-standard `localStorage` object in this environment | Injected explicit in-memory `Storage` in tests |
| 2026-05-23 | `npm run build` failed because test code used `Array.at`, which is outside the ES2020 lib target | Replaced with indexed access and reran verification successfully |

## Decisions

- Use existing docs as approved product/design context for implementation.
- First deliver a runnable MVP with mock/offline STT behavior if microphone/cloud STT is not safely available.
- Keep API keys local and avoid logging secrets.
- Manually scaffold the Vite/Tauri files instead of depending on an interactive project generator.
- Do not include the pre-existing `.gitignore` user change in scaffold commits.
- Keep TypeScript domain modules framework-independent so UI and Tauri bridge can share them.
- Auto-insert MVP uses clipboard as the reliable fallback while preserving a Tauri command boundary for later native input simulation.
- UI uses React local state for MVP workflow to keep the first runnable app small; domain modules remain separate for future state manager migration.
- Custom templates are stored inside local settings for the MVP; a separate template store can be introduced when template management grows.
