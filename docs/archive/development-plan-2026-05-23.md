# 语音输入助手开发拆解

## 1. 开发目标

本计划用于把产品设计、技术方案和 AI 润色模板拆成可执行的开发任务。

项目目标是先完成一个可运行、可演示的 Windows 桌面语音输入助手。第一阶段重点不是覆盖所有扩展能力，而是跑通主流程：

```text
录音 -> 中文语音识别 -> AI 场景润色 -> 复制或自动插入 -> 历史记录
```

开发过程中应保持以下原则：

- 不做传统系统输入法 IME。
- 不把项目做成重型企业系统。
- 不在文档中写具体完成时间或赶工表述。
- 不把 API Key 写死在前端代码里。
- 不长期保存用户原始音频。
- 先保证主流程可运行，再补充高级能力。
- 产品展示重点始终围绕“AI 场景化润色模板”。

## 2. 阶段划分

整体开发分为六个阶段：

1. 项目基础与环境确认
2. 前端主界面与状态骨架
3. 设置、模板和本地数据
4. 录音与语音识别主流程
5. AI 润色与文本输出
6. 历史记录、错误处理和演示打磨

每个阶段都应产出一个可以验证的结果，避免长期停留在不可运行状态。

## 2.1 自动执行约束

如果后续由 AI 或脚本按本计划自动执行，应遵守以下约束：

- 默认使用 `npm`，不要混用 `pnpm`、`yarn` 或 `bun`。
- 默认在当前主分支工作，不主动创建功能分支。
- 不主动执行 `git push`。
- 脚手架和初始化命令不得删除或覆盖 `docs/`、`AGENTS.md`、`.gitignore` 和已有 git 历史。
- 每个阶段完成后先运行对应验证命令，再进行本地提交。
- 提交信息遵守 `AGENTS.md`，格式为 `<type>: <中文描述>`。
- 如果某个外部服务缺少 API Key，应使用本地 mock 或明确的降级路径保证演示流程可继续。
- 如果环境缺少 Rust、Cargo、MSVC Build Tools 或 Windows SDK，应停止初始化 Tauri 并记录阻塞原因。
- 如果 Node.js 当前版本导致依赖安装或构建异常，应切换到 LTS 版本或记录阻塞原因，不要反复重试同一失败命令。
- 不依赖人工验收。所有阶段验收必须能通过命令、测试、mock、日志或自动化 smoke test 判断。
- 不依赖真实麦克风、真实 STT Key 或真实 LLM Key 才能通过主流程验收。真实服务作为可配置能力，默认自动化验收走 mock/dev provider。

## 2.2 测试先行约束

后续自动执行必须采用测试先行。除脚手架生成文件、配置文件和一次性探索代码外，新增业务行为应先写失败测试，再写实现。

测试策略如下：

- 前端纯逻辑、状态和模板处理使用 Vitest。
- React 组件和交互使用 React Testing Library。
- Rust 服务、Provider、storage 和 command 边界使用 `cargo test`。
- Tauri 系统能力通过 adapter/service 层隔离，优先测试 adapter 的输入输出和失败兜底，不直接把操作系统行为写死在业务测试里。
- 录音、STT、LLM、剪贴板、自动插入都必须有 mock/dev 实现，保证无人值守环境可以跑通完整主流程。
- 每个功能点遵循 Red-Green-Refactor：
  - 先写描述目标行为的失败测试。
  - 运行对应测试，确认因功能缺失失败。
  - 写最小实现让测试通过。
  - 再运行相关测试和阶段验证命令。
- 如果某个行为暂时无法自动化测试，应先拆出可测试的纯函数或服务层；不能把“人工验证”作为完成条件。
- bug 修复必须先添加能复现问题的失败测试，再修复。

建议测试依赖：

```text
vitest
@testing-library/react
@testing-library/user-event
@testing-library/jest-dom
jsdom
```

建议脚本：

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

## 2.3 第一版技术边界

为减少自动执行时的歧义，第一版按以下边界实现：

- 录音优先使用前端 `MediaRecorder` 获取麦克风音频。
- 录音格式优先使用浏览器支持的 `audio/webm`；如果后续 STT Provider 不支持该格式，再在 Rust 层增加转码或改为 `wav` 采集方案。
- 临时音频只用于本次识别流程，不写入历史记录。
- STT 先实现 Provider 抽象和 mock Provider，云端 Provider 通过设置页配置启用。
- 未配置 STT 服务时，使用 mock Provider 返回示例中文文本，保证界面和 AI 润色演示可跑通。
- LLM 先只实现 OpenAI-compatible Chat Completions。
- 未配置 LLM 时，原文模式照常输出；润色模板使用原始识别文本兜底并提示用户配置。
- 复制使用 Tauri 官方 clipboard-manager 插件。
- 本地配置和历史记录优先使用 Tauri store 插件；如插件接入受阻，可退回 Rust command 读写本地 JSON。
- 全局快捷键使用 Tauri 官方 global-shortcut 插件；第一轮必须实现按下开始、松开结束的事件入口，若系统占用快捷键则提示用户更换。
- 自动插入通过 Rust command 实现 Windows 文本输入模拟；失败时必须先复制到剪贴板，再提示用户手动粘贴。

## 3. 阶段一：项目基础与环境确认

### 目标

建立 Tauri 2 + React + TypeScript + Vite 项目骨架，确认 Windows 桌面开发环境可用。

### 任务

- 确认基础工具可用：
  - `node --version`
  - `npm --version`
  - `rustc --version`
  - `cargo --version`
- 确认当前目录只包含可保留文件，不删除已有文档和 git 信息：
  - `Get-ChildItem -Force`
  - `git status --short`
- 如果 Rust 或 Cargo 不可用，先完成 Rust 安装和环境变量确认。
- 如果 Tauri 初始化或构建失败，优先检查 MSVC Build Tools 和 Windows SDK。
- 初始化 Tauri 2 + React + TypeScript + Vite 项目，优先使用非交互命令：
  - `npm create vite@latest . -- --template react-ts`
  - `npm install`
- `npm install recoil @tauri-apps/api`
- `npm install -D @tauri-apps/cli typescript vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
  - `npm run tauri init -- --ci --app-name voice-input-assistant --window-title 语音输入助手 --frontend-dist ../dist --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"`
- 如果 Vite 因当前目录非空拒绝初始化，应先在临时目录生成 React TypeScript 模板，再只复制必要的 `src/`、`index.html`、`package.json`、`tsconfig`、`vite.config.ts` 等项目文件，不能覆盖 `docs/` 和 `AGENTS.md`。
- 加入 Recoil。
- 加入 Tauri 插件：
  - `npm run tauri add clipboard-manager`
  - `npm run tauri add store`
  - `npm run tauri add global-shortcut`
- 建立基础目录结构：

```text
src/
  app/
  components/
  features/
    recorder/
    speech/
    polish/
    output/
    history/
    settings/
  state/
  types/
  utils/
src-tauri/
  src/
    commands/
    providers/
    services/
    storage/
```

### 验收标准

- 可以启动前端开发服务。
- 可以启动 Tauri 桌面窗口。
- 项目包含基础目录结构。
- 没有把任何真实 API Key 写入代码或文档。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug
```

如果 `npm run tauri build -- --debug` 因本机打包环境不完整失败，应保留 `npm run typecheck`、`npm run test`、`npm run build`、`cargo test` 和 `cargo check` 的结果，并在提交正文说明阻塞原因。

## 4. 阶段二：前端主界面与状态骨架

### 目标

先做出可操作的主界面和状态流转，即使底层能力暂时使用模拟数据，也能展示完整产品形态。

### 任务

- 定义核心 TypeScript 类型：
  - `AppStatus`
  - `PromptTemplate`
  - `SpeechRecognitionResult`
  - `HistoryItem`
  - `OutputMode`
  - `UserSettings`
- `UserSettings` 至少包含：
  - `sttProvider`
  - `sttBaseUrl`
  - `sttApiKey`
  - `sttModel`
  - `sttLanguage`
  - `sttAudioFormat`
  - `llmBaseUrl`
  - `llmApiKey`
  - `llmModel`
  - `llmTemperature`
  - `defaultTemplateId`
  - `defaultOutputMode`
  - `hotkey`
- 建立 Recoil 状态：
  - 当前应用状态
  - 当前模板
  - 输出方式
  - 原始识别文本
  - 最终输出文本
  - 错误信息
  - 历史记录
  - 用户设置
- 实现主界面基础区域：
  - 录音按钮
  - 状态显示
  - 润色模板选择
  - 输出方式选择
  - 原始文本区域
  - 最终文本区域
  - 历史记录区域
  - 设置入口
- 实现模拟流程：
  - 点击录音按钮进入 `recording`
  - 再次点击进入 `recognizing`
  - 使用模拟中文识别文本
  - 进入 `polishing`
  - 使用模拟润色结果
  - 进入 `completed`

### 验收标准

- 用户可以在界面上完成一次模拟输入流程。
- 状态提示能正确显示待机、录音、识别、润色、完成和失败。
- 模板选择和输出方式选择能影响当前状态。
- 页面能清楚展示原始文本和最终文本。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
```

## 5. 阶段三：设置、模板和本地数据

### 目标

建立配置、模板和历史记录的数据基础，让后续真实能力可以复用同一套数据结构。

### 任务

- 实现内置润色模板：
  - 原文模式
  - 去除口语
  - 正式表达
  - 简洁表达
  - 聊天表达
  - 会议/课堂要点
- 实现自定义提示词的基础数据结构。
- 保存自定义提示词时校验 `{{input}}` 变量；缺少变量时提示用户修正，不保存无效模板。
- 实现设置页或设置弹窗：
  - STT Provider
  - STT Base URL
  - STT API Key
  - STT Model
  - STT Language
  - STT Audio Format
  - LLM Base URL
  - API Key
  - Model
  - Temperature
  - 默认润色模板
  - 默认输出方式
  - 快捷键设置入口
- 实现本地配置读取和保存 command 或 store 封装。
- 实现历史记录读取和保存 command 或 store 封装。
- 在阶段三完成历史记录 schema 和写入接口；阶段六只补展示、复制和错误恢复。
- 限制历史记录数量，避免无限增长。

### 验收标准

- 重启应用后，用户设置仍然保留。
- 内置模板可以被选择并用于流程判断。
- 原文模式会跳过 AI 润色。
- 历史记录只保存文本结果，不保存原始音频。
- API Key 不出现在日志和前端硬编码中。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 6. 阶段四：录音与语音识别主流程

### 目标

接入真实录音能力和至少一个可用的中文语音识别 Provider，完成从语音到原始文本的主流程。

### 任务

- 实现页面按钮录音：
  - 点击开始录音
  - 再次点击结束录音
  - 结束后生成临时音频数据或内存 Blob
  - 将录音状态、时长和错误信息反馈到界面
- 实现快捷键录音入口：
  - 长按开始
  - 松开结束
  - 快捷键被占用时提示用户更换
- 建立语音识别 Provider 抽象。
- 实现 mock STT Provider：
  - 不需要 API Key
  - 返回固定或可配置的中文示例文本
  - 用于无 STT 配置时的演示兜底
- 实现可配置云端中文 STT Provider：
  - 从设置读取 Base URL、API Key、Model、Language 和 Audio Format
  - 不在代码中绑定单一供应商
  - 请求失败时返回结构化错误
- 录音结束后调用识别 Provider。
- 识别完成后清理临时音频。
- 处理常见异常：
  - 麦克风不可用
  - 录音内容为空
  - 识别请求失败
  - 网络不可用

### 验收标准

- 用户可以通过页面按钮录一段中文语音。
- 录音结束后可以得到中文识别文本。
- 临时音频不会作为历史内容长期保存。
- 识别失败时界面有明确提示，并允许用户重新尝试。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

无人值守验收：

- 自动化测试覆盖不配置 STT 时 mock Provider 跑通主流程。
- 自动化测试覆盖配置 STT 时会调用云端 Provider adapter，并验证请求构造、错误处理和兜底逻辑。
- 真实 STT 服务只作为可选 smoke test，不作为默认完成条件。

## 7. 阶段五：AI 润色与文本输出

### 目标

接入 OpenAI-compatible LLM 调用，把原始识别文本按模板转换为最终文本，并支持复制和插入。

### 任务

- 建立 LLM Provider 抽象。
- 实现 OpenAI-compatible Chat Completions 调用。
- 根据当前模板拼接 system prompt 和 user prompt。
- 支持 `{{input}}` 变量替换。
- 实现润色失败兜底：
  - LLM 未配置时使用原始识别文本
  - LLM 请求失败时使用原始识别文本
  - LLM 返回空内容时使用原始识别文本
- 实现复制到剪贴板。
- 实现自动插入当前光标位置。
- 自动插入失败时，保留复制结果并提示用户手动粘贴。

### 验收标准

- 用户可以选择不同润色模板并得到不同风格的最终文本。
- 原文模式不调用 LLM。
- LLM 配置缺失时不会导致原始识别文本丢失。
- 最终文本可以复制到剪贴板。
- 自动插入失败时仍能通过剪贴板找回结果。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

无人值守验收：

- 自动化测试覆盖原文模式不发起 LLM 请求。
- 自动化测试覆盖缺少 LLM API Key 时，润色流程显示提示并保留原始识别文本。
- 自动化测试覆盖复制 adapter 收到最终文本，并在失败时返回结构化错误。
- 真实系统剪贴板只作为可选 smoke test，不作为默认完成条件。

## 8. 阶段六：历史记录、错误处理和演示打磨

### 目标

补齐演示闭环，确保核心流程稳定、可解释、可恢复。

### 任务

- 使用阶段三的数据接口，在每次处理完成后写入历史记录。
- 历史记录展示：
  - 原始识别文本
  - 最终输出文本
  - 使用模板
  - 处理状态
  - 创建时间
- 支持从历史记录复制最终文本。
- 支持从历史记录查看原始文本。
- 统一错误提示：
  - 麦克风权限或设备问题
  - 无有效语音
  - 语音识别失败
  - LLM 未配置
  - LLM 调用失败
  - 自动插入失败
  - 网络不可用
- 打磨演示路径：
  - 展示原始识别文本的口语化问题
  - 切换“去除口语”模板
  - 切换“正式表达”模板
  - 展示复制和插入
  - 展示历史记录
  - 展示设置页中的模型配置

### 验收标准

- 完整演示流程可以连续完成。
- 失败场景不会丢失已经识别或生成的文本。
- 历史记录能找回最近输入结果。
- AI 场景化润色模板是演示中的主要亮点。

### 验证命令

```powershell
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug
```

无人值守验收：

- 自动化测试完整覆盖一次“开始录音、结束录音、mock 识别、模板润色、复制 adapter、插入 adapter、写入历史、读取设置”的主流程。
- 自动化测试覆盖断网或缺少外部服务配置时，mock STT 和原文兜底仍能完成核心产品流程。
- 自动化测试覆盖历史记录可以找回最近输入结果。

## 9. 暂缓开发项

以下能力暂时不进入第一轮主流程开发，只保留接口或设计空间：

- 传统系统 IME 接入
- 账号系统
- 多平台适配
- 实时流式语音识别
- 本地语音识别模型
- 多 LLM 协议深度适配
- 术语词库和个人常用词
- 复杂模板市场或模板分享
- 托盘控制和复杂窗口管理
- 大规模日志、遥测或企业管理能力

## 10. 建议提交拆分

后续开发可以按阶段或稳定功能点提交，提交信息遵守仓库根目录 `AGENTS.md`。

提交前应先运行当前阶段的验证命令。默认只做本地提交，不执行 `git push`。如果一次提交包含多个关键变更，应添加提交正文说明主要改动和原因。

如果阶段验证命令失败，不得提交“完成”类提交。应先修复失败，或在提交正文中明确标注阻塞命令、失败原因和已完成范围。

示例：

```text
chore: 初始化 Tauri React 项目
feat: 添加主界面状态骨架
feat: 添加内置润色模板
feat: 接入本地设置保存
feat: 实现录音与语音识别流程
feat: 接入 OpenAI 兼容润色接口
feat: 添加复制和自动插入输出
feat: 添加历史记录
fix: 修复润色失败时文本丢失问题
docs: 补充开发任务拆解
```

## 11. 优先级总结

最高优先级：

- 项目可启动
- 主界面可操作
- 录音可用
- 中文识别可用
- AI 润色模板可用
- 最终文本可复制
- 历史记录可查看

第二优先级：

- 自动插入
- 快捷键录音
- 自定义提示词
- 更完整的设置保存
- 更清晰的错误提示

暂缓优先级：

- 流式识别
- 本地识别
- 多模型协议
- 多平台适配
- 复杂模板管理
