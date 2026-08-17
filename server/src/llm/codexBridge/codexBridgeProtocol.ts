export interface OpenAICompatibleMessage {
  role?: unknown;
  content?: unknown;
}

export interface OpenAICompatibleChatRequest {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  response_format?: unknown;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return content == null ? "" : JSON.stringify(content);
  }
  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }
    if (!part || typeof part !== "object") {
      return "";
    }
    const record = part as { type?: unknown; text?: unknown };
    if ((record.type === "text" || record.type === "input_text") && typeof record.text === "string") {
      return record.text;
    }
    return "";
  }).filter(Boolean).join("\n");
}

export function buildCodexPrompt(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("本地 Codex 请求缺少 messages。");
  }
  const rendered = messages.map((message, index) => {
    const record = message && typeof message === "object"
      ? message as OpenAICompatibleMessage
      : {};
    const role = typeof record.role === "string" && record.role.trim()
      ? record.role.trim().toUpperCase()
      : `MESSAGE_${index + 1}`;
    return `===== ${role} =====\n${contentToText(record.content)}`;
  }).join("\n\n");

  return [
    "你正在作为小说生产系统的纯文本生成引擎运行。",
    "不要读取本地文件，不要执行命令，不要调用工具，不要修改任何内容。",
    "严格遵守下方消息中的角色顺序与输出要求，只给出最终答案。",
    "",
    rendered,
  ].join("\n");
}

export function extractOutputSchema(responseFormat: unknown): Record<string, unknown> | undefined {
  if (!responseFormat || typeof responseFormat !== "object") {
    return undefined;
  }
  const record = responseFormat as {
    type?: unknown;
    json_schema?: { schema?: unknown };
  };
  const schema = record.type === "json_schema" ? record.json_schema?.schema : undefined;
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : undefined;
}

export function resolveRequestedCodexModel(value: unknown): string | undefined {
  const model = typeof value === "string" ? value.trim() : "";
  return model && model !== "local-chatgpt" ? model : undefined;
}
