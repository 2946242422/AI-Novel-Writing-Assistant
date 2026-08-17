# 本地 Codex 作为小说生产模型通道

## 背景

部分本地用户拥有已登录的 Codex 桌面版或 CLI，但没有单独购买 OpenAI API 额度。Codex 官方提供非交互执行、JSONL 事件和 JSON Schema 输出，并允许复用已保存的 ChatGPT 管理登录，因此可以作为个人本地模型通道。

## 决策

系统提供内置厂商“本地 Codex”，通过仅监听回环地址的兼容层接入现有 LLM 工厂。第一阶段使用 `codex exec`：每次调用都是独立、临时、只读的 Codex 会话。业务 Prompt、Zod 校验、修复、限流和任务审计不直接依赖 Codex CLI。

```text
Prompt Registry / 章节生产
          ↓
       LLM 工厂
          ↓
OpenAI Chat Completions 兼容层（127.0.0.1）
          ↓
codex exec（ChatGPT 管理登录）
          ↓
最终文本 / JSON Schema 结果
```

## 当前规则

- 厂商 id 为 `codex`，兼容模型 id 为 `local-chatgpt`；兼容 id 不代表真实上游模型。
- 真实 Codex 模型默认由本机 Codex 决定，可用 `CODEX_BRIDGE_MODEL` 显式覆盖。
- 调用环境必须删除 API Key 变量，只允许 Codex 自行使用已保存的 ChatGPT 登录。
- 桥接只绑定 `127.0.0.1`，并在空的临时目录中使用只读沙箱运行。
- 结构化任务优先使用 JSON Schema；桥接将现有 schema 交给 Codex `--output-schema`，返回后仍执行原有 Zod 校验。
- 并发固定收敛到 1，避免本地账户限额被批量任务瞬间耗尽。
- 本地 Codex 不参与 Embedding/RAG 向量模型选择。

## 为什么不用 Skill 或 MCP 作为调用入口

- Skill 负责约束 Codex 的工作方法，不能让外部小说平台直接提交模型请求。
- MCP 的主要方向是 Codex 调用外部工具；可在后续用于让 Codex读取经授权的小说资产，但不是本次“提示词进入、结果返回”的传输协议。
- 非交互 CLI 和 App Server才是外部程序调用 Codex 的官方编程表面。

## 安全边界

- 不读取或复制 `~/.codex/auth.json`；它应按密码处理。
- 不把小说项目目录作为 Codex 工作目录，不授予写权限。
- 不向局域网暴露桥接端口。
- 不允许从请求体覆盖执行命令、CLI 路径、工作目录或沙箱等级。
- 子进程错误只返回经过截断的诊断，不回传登录令牌和完整环境变量。

## 失败模式

- 未安装或未登录 Codex：连接检测返回明确错误，用户先完成 Codex 登录。
- ChatGPT/Codex 限额耗尽：映射为 429，不自动切换 API Key。
- 执行超时或取消：终止当前子进程并清理临时目录。
- 使用真实模型名作为兼容模型 id：部分 LangChain 模型名会自动切到 Responses API；对外固定使用 `local-chatgpt`，真实模型只通过桥接环境配置。
- 多任务并发：必须排队，不能为提高速度同时启动多个 Codex 进程。

## 后续演进

调用量增加时，将执行器替换为常驻 `codex app-server`，复用线程/回合和流式事件。兼容层及上层 LLM 工厂保持不变。

## 相关模块

- `server/src/llm/codexBridge/`
- `server/src/llm/factory.ts`
- `server/src/llm/providers.ts`
- `server/src/llm/structuredOutput.ts`
- `client/src/components/onboarding/QuickSetupDialog.tsx`

## 来源文档

- [Codex 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
