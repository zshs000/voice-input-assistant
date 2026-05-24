# 项目审查意见

审查日期：2026-05-24

## 总体结论

项目已经具备可运行桌面应用的主体形态：Tauri + React 界面、DashScope 实时语音识别路径、OpenAI-compatible 润色、本地设置/历史、剪贴板输出、自动插入探索、小窗口和全局快捷键都已经落地。

本次整理的主要问题不在“是否有实现”，而在“文档和实现严重脱节”。旧文档仍描述 Recoil、Tauri Store、非流式识别、旧 command 名称和本地交接流程，容易误导后续开发。

## 已整理内容

- 归档旧文档到 `docs/archive/`：
  - `development-plan-2026-05-23.md`
  - `handoff-2026-05-23.md`
  - `agent-mvp-plan-2026-05-23.md`
- 重写当前有效文档：
  - `docs/product-design.md`
  - `docs/technical-design.md`
  - `docs/prompt-templates.md`
- 新增根目录 `README.md`。
- 新增 `npm run typecheck`。
- 修正 `normalizeSettings({})` 中 STT Provider 缺省值与 `DEFAULT_SETTINGS` 不一致的问题。

## 主要风险与建议

### 高优先级

1. 首次启动体验需要明确决策。
   - 当前默认 STT Provider 是 DashScope，但没有 API Key 会导致录音流程直接失败。
   - 建议二选一：默认改为 Mock 保证开箱演示，或保留 DashScope 但增加首次启动配置引导。

2. `src/App.tsx` 已经超过 1000 行。
   - 录音流程、ASR 生命周期、模板管理、窗口模式、设置表单和历史展示都集中在一个组件中。
   - 建议下一轮拆分为 hooks 和组件：`useRecordingFlow`、`useSettingsPersistence`、`SettingsDialog`、`ResultPanel`、`HistoryPanel`。

3. Rust command 缺少自动化测试。
   - 前端 Vitest 覆盖较好，但 Rust 侧主要依赖 `cargo check`。
   - 建议为 JSON 存储、ASR 事件解析、窗口/插入失败消息等可拆纯函数补测试。

### 中优先级

4. 密钥以明文 JSON 保存在本机 app data。
   - 对个人演示可接受，但正式使用建议接入系统密钥环或至少在文档中明确风险。

5. 自动插入能力依赖焦点轮询和模拟粘贴。
   - 这是桌面助手形态下合理的折中，但需要更多实际应用 smoke test。

6. `speech.ts` 中的通用 `SpeechRecognitionProvider` 与当前 DashScope service 路径没有真正贯通。
   - 建议后续统一抽象，避免“文档里有 Provider、代码里另走 service”的双轨状态。

### 低优先级

7. `bundle.active=false` 适合当前可执行程序验证，但不是最终分发形态。
   - 后续需要重新处理 NSIS/WiX 打包环境。

8. 历史记录只有基础列表。
   - 后续可以增加搜索、复制单条、删除单条、显示模板名称等能力。

## 验证记录

本次整理前基线验证：

```text
npm test: 10 files / 39 tests passed
npm run build: passed
cargo check --manifest-path src-tauri\Cargo.toml: passed
```

整理完成后复验：

```text
npm run typecheck: passed
npm test: 10 files / 39 tests passed
npm run build: passed
cargo check --manifest-path src-tauri\Cargo.toml: passed
```

## 完成审计

| 用户要求 | 证据 |
| --- | --- |
| 完整阅读项目 | 已检查根目录、Git 状态、package/Cargo/Tauri 配置、前端入口、主界面、domain/service 模块、Rust commands、能力配置、AudioWorklet、样式、测试和全部 docs。 |
| 整理文档 | `README.md`、`docs/product-design.md`、`docs/technical-design.md`、`docs/prompt-templates.md` 已按当前实现重写。 |
| 文档与现实不符时归档 | `docs/archive/` 保存旧开发计划、交接说明和 agent MVP 计划，并有归档说明。 |
| 整理代码 | 新增 `npm run typecheck`，修正 settings 归一化默认 STT Provider 不一致问题，并补充测试断言。 |
| 根目录给出审查意见 | 本文件位于项目根目录，列出总体结论、已整理内容、风险和后续建议。 |
| 验证当前健康度 | `typecheck`、测试、前端构建、Rust check 均已通过。 |
