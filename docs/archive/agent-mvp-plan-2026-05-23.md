# Voice Input Assistant MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Windows desktop MVP for the voice input assistant with a Tauri backend, React UI, tested TypeScript domain modules, local persistence, LLM polishing, clipboard output, and safe fallbacks for system-dependent features.

**Architecture:** The frontend owns user workflow state and calls focused service modules for templates, LLM requests, local/Tauri storage, and command bridging. The Rust backend exposes Tauri commands for persistent settings/history, clipboard output, auto-insert exploration, mock recording, and mock STT so the MVP remains runnable before real STT integration.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vite, Vitest, CSS modules/plain CSS.

---

## File Structure

- `package.json`: npm scripts and frontend/Tauri dependencies.
- `index.html`, `vite.config.ts`, `tsconfig*.json`: Vite and TypeScript setup.
- `src/main.tsx`, `src/App.tsx`, `src/styles.css`: React entry and desktop UI.
- `src/domain/templates.ts`: built-in prompt templates and prompt rendering.
- `src/domain/settings.ts`: settings defaults, sanitization, and validation helpers.
- `src/domain/history.ts`: history item helpers and trimming.
- `src/domain/llm.ts`: OpenAI-compatible request/response handling.
- `src/services/tauri.ts`: frontend command bridge with browser fallback.
- `src/**/*.test.ts`: focused Vitest tests for core behavior.
- `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/*.rs`: Rust app and commands.

## Tasks

### Task 1: Scaffold App

**Files:** create Vite/React/Tauri config and minimal entry files.

- [ ] Create npm, TypeScript, Vite, and Tauri config files.
- [ ] Create minimal React entry and CSS.
- [ ] Install dependencies.
- [ ] Verify `npm test` can run a placeholder test or no tests cleanly.
- [ ] Commit with `chore: 初始化桌面应用脚手架`.

### Task 2: TypeScript Domain Core

**Files:** create `src/domain/*.ts` and corresponding tests.

- [ ] Write failing tests for prompt rendering, missing `{{input}}` validation, default settings, history trimming, and LLM response parsing.
- [ ] Run tests and confirm expected failures.
- [ ] Implement domain modules minimally.
- [ ] Run tests and confirm green.
- [ ] Commit with `feat: 添加语音助手核心领域模型`.

### Task 3: Tauri Bridge and Rust Commands

**Files:** create `src/services/tauri.ts`, `src-tauri/src/main.rs`, `src-tauri/src/commands.rs`.

- [ ] Add tests for browser fallback behavior where practical.
- [ ] Implement settings/history persistence commands.
- [ ] Implement clipboard command.
- [ ] Implement auto-insert command as best-effort clipboard plus documented fallback.
- [ ] Implement mock recording and mock STT commands.
- [ ] Run frontend tests and Rust tests/checks.
- [ ] Commit with `feat: 添加桌面命令桥接`.

### Task 4: React MVP UI

**Files:** update `src/App.tsx`, `src/styles.css`.

- [ ] Build main input panel with status, record button, template selector, and output mode selector.
- [ ] Build text result area with recognized/final text, copy, insert, and repolish actions.
- [ ] Build settings panel for STT/LLM configuration.
- [ ] Build recent history panel.
- [ ] Wire workflow: record toggle -> mock STT -> optional LLM polish -> output -> history.
- [ ] Run tests and build.
- [ ] Commit with `feat: 实现语音输入助手 MVP 界面`.

### Task 5: Verification and Audit

**Files:** update planning/progress docs as needed.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run Rust verification available in `src-tauri`.
- [ ] Inspect `git status`.
- [ ] Map `/goal` requirements to artifacts and note gaps.
- [ ] Commit final docs/progress updates with `docs: 更新 MVP 实施记录`.
