# 重复故障模式与排查路径

## 背景

项目多次出现的故障往往不是单点 bug，而是边界被绕过：重型任务跑在 API 进程、状态多源推断、Prompt 绕过 registry、章节热路径过长、RAG 检索范围不一致。把这些排查结论沉淀下来，可以避免每次重新定位同类问题。

## 决策

调试时先确认事实源、执行面、投影和治理入口，再看具体代码。不要先用 UI 补丁、关键词兜底或局部 try/catch 掩盖系统性问题。

## 当前规则

- API 卡死先查是否有长任务仍在 Web API 进程执行。
- 状态不一致先查 `DirectorRun / StepRun / Event / Artifact` 与 projection，而不是先改前端显示。
- Prompt 输出问题先查 PromptAsset、schema、repair、semantic retry 和 provider capability。
- 章节产出慢先查热路径是否重新串入多次 LLM 后处理。
- RAG 不命中先查显式文档、绑定文档、全局启用文档和 context resolver。
- 数据破坏风险操作必须先备份、验证备份，再取得明确批准。

## 示例

常见排查路径：

- 继续导演后所有接口变慢：检查 route 是否直接 await 长任务，Worker 是否独立 lease，SQLite/Prisma 写锁是否被长链路占用。
- 任务中心显示失败但小说页显示运行中：检查 projection 是否由旧 task status、runtime command 和产物事实混合推断。
- 章节正文为空还继续推进：检查 writer 空返回防线、单章自动重试和失败落态。
- 章节审校反复进入修复循环：检查后置质量闭环是否已经封顶为一次修复，最终结果是否已收敛到“未通过但继续生产”，以及工作区是否还把终态章节算成 repair ticket。
- 长弧伏笔被当成当前章阻断：检查时间线钩子的 `resolveMode` 和 `blocking` 是否被误标成 `immediate + blocking`，以及检测器是否把 `short_arc` / `long_arc` 升级成硬失败。
- 重新生成候选没有进入新一轮：检查 batch reuse、command idempotency 和候选阶段运行态。
- 生成没有使用知识库资料：检查 `knowledgeDocumentIds`、小说/世界绑定、启用状态和 prompt context requirement。

## 失败模式

不能用来替代根因修复的手段：

- 降低前端轮询频率来掩盖 API 执行面阻塞。
- UI 禁用按钮来避免重复执行，而不处理 command 幂等。
- 给意图识别加关键词 fallback 来掩盖 AI schema 或上下文问题。
- 在业务 service 里补局部 JSON parse 分支来绕过 Prompt Registry。
- 把后台资产回灌失败显示成正文生成失败。

## 相关模块

- `server/src/routes/`
- `server/src/workers/`
- `server/src/services/novel/director/`
- `server/src/services/novel/runtime/`
- `server/src/services/rag/`
- `server/src/prompting/`
- `client/src/pages/tasks/`
- `client/src/pages/novels/`

## 来源文档

- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [README 最新更新](../../../README.md)

## Gemini 配置检测长期停留在连接中

### 现象

快捷配置停留在“正在检测普通文本与结构化输出”，浏览器或其他客户端使用同一 API Key 可以调用 Gemini，但 Node 服务没有返回成功或失败。

### 判断顺序

1. 检查 Node 服务到 `generativelanguage.googleapis.com:443` 的连接状态；长期停留在 `SYN_SENT` 说明问题发生在 TCP 建连阶段，不是 API Key 或结构化输出解析失败。
2. 分别验证直连与本地代理。Windows 的“系统代理”只会自动作用于使用 WinINET/系统代理感知的程序，Node `fetch` 与 OpenAI SDK 不会自动继承该设置。
3. 检查代理监听端口。开发环境默认使用 `http://127.0.0.1:7897` 访问 Gemini；可以通过 `GEMINI_PROXY_URL` 覆盖 Gemini 代理，或通过 `AI_NOVEL_PROXY_URL` 为 OpenAI 兼容模型请求指定统一代理。

### 当前规则

- 官方 Gemini 接口默认通过本地代理 `http://127.0.0.1:7897` 发起请求。
- 代理优先级为 `GEMINI_PROXY_URL`、`AI_NOVEL_PROXY_URL`、`HTTPS_PROXY`、`ALL_PROXY`、`HTTP_PROXY`、Gemini 本地默认值。
- 普通文本与结构化输出探针都有 30 秒强制超时。代理未启动或网络不可达时必须返回可见错误，不能让配置界面无限等待。
- DeepSeek 等非 Gemini 官方地址不会因为 Gemini 的本地默认值而被强制代理；只有显式配置通用代理环境变量时才会走代理。

### 维护边界

代理由 LLM 传输层统一注入，不应在具体规划、写作、审校或修复服务中分别处理。代理地址不得写入请求日志，避免包含认证信息的代理 URL 泄漏。

## 自定义 OpenAI 兼容接口返回网页或空内容

### 现象

- 获取模型列表时报 `Unexpected token '<'`，响应以 `<!doctype html>` 开头。
- 普通短文本可能通过检测，但长篇结构化请求等待较久后返回空内容，没有 `finish_reason` 和 token 用量。

### 判断顺序

1. 分别访问自定义域名的 `/models` 与 `/v1/models`。前者返回 HTML、后者返回 JSON 错误时，说明 Base URL 缺少 `/v1`。
2. 检查最终请求预览是否指向 `/v1/chat/completions`，避免把请求发送到官网前端路由。
3. Base URL 正确但仍空返回时，再检查中转是否完整转发 OpenAI SSE、`content`、`reasoning_content`、`finish_reason` 和 usage 字段。

### 当前规则

- 自定义 OpenAI 兼容地址只有 origin、路径为空或仅为 `/` 时，自动补全 `/v1`。
- 已明确填写 `/v1`、`/openai/v1` 或其他路径时保持原样，不猜测和覆盖用户的网关路由。
- 界面预览、模型列表获取、连接检测、快捷配置、创建和编辑厂商必须使用同一份规范化结果。
