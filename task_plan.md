# App Component Split Plan

## Goal

在不改变功能和交互语义的前提下，拆分过大的 `src/App.tsx`，把 JSX 视图拆到小组件中，保留现有状态与业务流程。

## Concrete Deliverables

- 新增 `src/components/` 下的展示组件。
- `src/App.tsx` 保留应用状态、effects、录音、ASR、输出、持久化和模板操作逻辑。
- 精灵窗口、小窗口、主工作区、设置弹窗从 `App.tsx` 中提取。
- 不主动调整 CSS 和业务行为。
- 使用现有测试、类型检查、构建和 Rust check 验证功能未破坏。

## Phases

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Baseline and split boundaries | complete | Reviewed `App.tsx`, `App.test.tsx`, current branch status, and render branch boundaries |
| 2. Extract shared UI types and components | complete | Added `appUi`, `SpiritWindow`, `CompactWindow`, `MainWorkspace`, `SettingsModal` |
| 3. Rewire `App.tsx` container | complete | Replaced inline render branches with component calls; side effects remain in `App.tsx` |
| 4. Verification | complete | `npm run typecheck`, `npm test`, `npm run build`, `cargo check --manifest-path src-tauri\Cargo.toml` passed |

## Decisions

- Use container/presenter split only; do not introduce new state library or custom hooks in this pass.
- Keep all side effects in `App.tsx`.
- Let components receive values and callbacks via props.
- Reuse existing class names and DOM text to preserve UI and tests.

## Errors Encountered

| Time | Error | Resolution |
| --- | --- | --- |
