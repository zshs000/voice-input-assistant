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
| 2. Toolchain and scaffold strategy | in_progress | Node v25.2.1, npm 11.6.2, rustc/cargo 1.95.0 available |
| 3. Project initialization | pending | `package.json`, Vite app, Tauri config, Rust crate |
| 4. Tested TypeScript domain core | pending | Vitest tests for templates, settings/history store, LLM client helpers |
| 5. React UI MVP | pending | Main screen, templates, settings, history, status flow |
| 6. Tauri command bridge and Rust fallbacks | pending | Commands for settings/history/clipboard/insert/mock recording/STT |
| 7. Verification and commits | pending | `npm test`, `npm run build`, `cargo test`/Tauri build if available, git commits |
| 8. Completion audit | pending | Requirement-to-artifact checklist |

## Errors Encountered

| Time | Error | Resolution |
| --- | --- | --- |

## Decisions

- Use existing docs as approved product/design context for implementation.
- First deliver a runnable MVP with mock/offline STT behavior if microphone/cloud STT is not safely available.
- Keep API keys local and avoid logging secrets.
- Manually scaffold the Vite/Tauri files instead of depending on an interactive project generator.
