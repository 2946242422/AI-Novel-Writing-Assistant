import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildCodexPrompt,
  extractOutputSchema,
  resolveRequestedCodexModel,
  type OpenAICompatibleChatRequest,
} from "./codexBridgeProtocol";
import { runCodexExec, type CodexExecRequest, type CodexExecResult } from "./codexExecClient";

export const CODEX_BRIDGE_HOST = "127.0.0.1";
export const DEFAULT_CODEX_BRIDGE_PORT = 47_821;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

export type CodexBridgeRunner = (input: CodexExecRequest) => Promise<CodexExecResult>;

let serverPromise: Promise<void> | null = null;

function resolvePort(): number {
  const parsed = Number.parseInt(process.env.CODEX_BRIDGE_PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : DEFAULT_CODEX_BRIDGE_PORT;
}

export function getCodexBridgeBaseURL(): string {
  const configured = process.env.CODEX_BRIDGE_BASE_URL?.trim();
  return configured || `http://${CODEX_BRIDGE_HOST}:${resolvePort()}/v1`;
}

async function readJsonBody(req: IncomingMessage): Promise<OpenAICompatibleChatRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("本地 Codex 请求体过大。");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as OpenAICompatibleChatRequest;
  } catch {
    throw new Error("本地 Codex 请求不是合法 JSON。");
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function toOpenAIUsage(usage: CodexExecResult["usage"]): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens,
  };
}

function writeSse(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendStreamingCompletion(
  res: ServerResponse,
  input: { id: string; model: string; text: string; usage: CodexExecResult["usage"] },
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  writeSse(res, {
    id: input.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [{ index: 0, delta: { role: "assistant", content: input.text }, finish_reason: null }],
  });
  writeSse(res, {
    id: input.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: toOpenAIUsage(input.usage),
  });
  res.end("data: [DONE]\n\n");
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (/not logged in|login|unauthorized|认证|登录/iu.test(message)) return 401;
  if (/usage limit|rate limit|额度|限额/iu.test(message)) return 429;
  if (/cancel/iu.test(message)) return 499;
  if (/timeout|timed out|超时/iu.test(message)) return 504;
  return 502;
}

export function createCodexBridgeHandler(runner: CodexBridgeRunner = runCodexExec) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${CODEX_BRIDGE_HOST}`);
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: "ai-novel-codex-bridge" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: [{ id: "local-chatgpt", object: "model", created: 0, owned_by: "local-codex" }],
      });
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      console.warn(`[codex.bridge] unsupported route method=${req.method ?? "unknown"} path=${url.pathname}`);
      sendJson(res, 404, { error: { message: "Not found.", type: "not_found" } });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const prompt = buildCodexPrompt(body.messages);
      const outputSchema = extractOutputSchema(body.response_format);
      const requestedModel = resolveRequestedCodexModel(body.model);
      const controller = new AbortController();
      req.once("aborted", () => controller.abort());
      const result = await runner({
        prompt,
        outputSchema,
        model: requestedModel,
        timeoutMs: Number.parseInt(process.env.CODEX_BRIDGE_TIMEOUT_MS ?? "", 10) || undefined,
        signal: controller.signal,
      });
      const id = `chatcmpl-codex-${randomUUID()}`;
      const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "local-chatgpt";
      if (body.stream === true) {
        sendStreamingCompletion(res, { id, model, text: result.text, usage: result.usage });
        return;
      }
      sendJson(res, 200, {
        id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: "stop",
        }],
        usage: toOpenAIUsage(result.usage),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, errorStatus(error), {
        error: {
          message,
          type: "codex_bridge_error",
          code: "codex_bridge_failed",
        },
      });
    }
  };
}

async function probeExistingBridge(): Promise<boolean> {
  try {
    const response = await fetch(`http://${CODEX_BRIDGE_HOST}:${resolvePort()}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { service?: unknown };
    return payload.service === "ai-novel-codex-bridge";
  } catch {
    return false;
  }
}

export function ensureCodexBridgeServer(): Promise<void> {
  if (serverPromise) {
    return serverPromise;
  }
  serverPromise = new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      void createCodexBridgeHandler()(req, res);
    });
    server.once("error", async (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && await probeExistingBridge()) {
        resolve();
        return;
      }
      serverPromise = null;
      reject(error);
    });
    server.listen(resolvePort(), CODEX_BRIDGE_HOST, () => {
      const address = server.address() as AddressInfo;
      console.info(`[codex.bridge] listening on http://${CODEX_BRIDGE_HOST}:${address.port}`);
      server.unref();
      resolve();
    });
  });
  return serverPromise;
}
