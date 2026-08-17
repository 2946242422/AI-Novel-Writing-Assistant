# 本地 Codex 桥接

该模块把本机已登录的 Codex CLI 适配为只监听回环地址的 OpenAI Chat Completions 服务，供现有 LLM 工厂、结构化输出、限流、审计和任务路由复用。

## 边界

- 仅绑定 `127.0.0.1`，不向局域网暴露。
- 不读取、复制或记录 Codex 登录令牌；CLI 自行复用并刷新 ChatGPT 管理的登录状态。
- 每次请求创建独立临时目录，使用 `--ephemeral --sandbox read-only --ignore-rules --ignore-user-config`。
- 从子进程环境中移除 `OPENAI_API_KEY` 和 `CODEX_API_KEY`，避免意外切换到 API Key 计费。
- 所有请求串行执行。小说平台的流式接口会在 Codex 完成后返回一个最终文本块。

## 协议

- `GET /health`：桥接进程探针。
- `GET /v1/models`：返回兼容模型标识 `local-chatgpt`。
- `POST /v1/chat/completions`：接收现有 LangChain 请求。
- `response_format.type=json_schema` 时，将 schema 写入临时文件并通过 Codex `--output-schema` 强制最终结果。

## 可选环境变量

- `CODEX_BRIDGE_PORT`：本地监听端口，默认 `47821`。
- `CODEX_BRIDGE_BASE_URL`：使用外部已启动桥接时覆盖 Base URL。
- `CODEX_BRIDGE_TIMEOUT_MS`：单次 Codex 最长执行时间，默认 10 分钟。
- `CODEX_BRIDGE_CLI_PATH`：Codex CLI 入口；可指向可执行文件或 `codex.js`。
- `CODEX_BRIDGE_MODEL`：可选的真实 Codex 模型覆盖；界面中的兼容标识保持为 `local-chatgpt`。

## 限制

- 当前实现每次调用启动一个临时 Codex 进程，延迟和输入 token 开销高于直接模型 API。
- 受 ChatGPT 账户的 Codex 使用限额约束，不等于无限免费调用。
- Codex 是 Agent，不是通用低延迟推理服务。仅适合作为个人本地、低并发的小说生产通道。
