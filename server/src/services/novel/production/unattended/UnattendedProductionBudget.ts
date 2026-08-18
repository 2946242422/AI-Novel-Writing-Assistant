import type { DirectorUnattendedPolicy } from "@ai-novel/shared/types/novelDirector";
import { StructuredOutputError } from "../../../../llm/structuredOutput";

export interface UnattendedProductionBudgetSnapshot {
  batchCallCount: number;
  chapterCallCount: number;
  elapsedMinutes: number;
}

export interface UnattendedProductionBudgetDecision {
  exceeded: boolean;
  reason: "batch_call_limit" | "chapter_call_limit" | "batch_duration_limit" | null;
  message: string | null;
}

export class UnattendedProductionBudgetExceededError extends Error {
  constructor(
    message: string,
    readonly decision: UnattendedProductionBudgetDecision,
  ) {
    super(message);
    this.name = "UnattendedProductionBudgetExceededError";
  }
}

export function evaluateUnattendedProductionBudget(input: {
  policy: DirectorUnattendedPolicy;
  snapshot: UnattendedProductionBudgetSnapshot;
  chapterOrder: number;
}): UnattendedProductionBudgetDecision {
  if (input.snapshot.chapterCallCount > input.policy.maxLlmCallsPerChapter) {
    return {
      exceeded: true,
      reason: "chapter_call_limit",
      message: [
        `第 ${input.chapterOrder} 章已使用 ${input.snapshot.chapterCallCount} 次 AI 调用`,
        `超过每章 ${input.policy.maxLlmCallsPerChapter} 次的无人值守预算。当前正文已安全保存。`,
      ].join("，"),
    };
  }
  if (input.snapshot.batchCallCount > input.policy.maxBatchLlmCalls) {
    return {
      exceeded: true,
      reason: "batch_call_limit",
      message: `本批已使用 ${input.snapshot.batchCallCount} 次 AI 调用，超过 ${input.policy.maxBatchLlmCalls} 次的预算。当前章节已安全保存。`,
    };
  }
  if (input.snapshot.elapsedMinutes > input.policy.maxBatchDurationMinutes) {
    return {
      exceeded: true,
      reason: "batch_duration_limit",
      message: [
        `本批已运行 ${Math.ceil(input.snapshot.elapsedMinutes)} 分钟`,
        `超过 ${input.policy.maxBatchDurationMinutes} 分钟的预算。当前章节已安全保存。`,
      ].join("，"),
    };
  }
  return { exceeded: false, reason: null, message: null };
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function readCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown; cause?: { code?: unknown } }).code
    ?? (error as { cause?: { code?: unknown } }).cause?.code;
  return typeof code === "string" ? code : null;
}

export function isTransientProductionError(error: unknown): boolean {
  if (error instanceof StructuredOutputError) {
    if (error.category !== "transport_error") return false;
    const statusMatch = error.message.match(/\]\s+(\d{3})\b/);
    const status = statusMatch ? Number(statusMatch[1]) : null;
    return status === null || status === 408 || status === 409 || status === 429 || status >= 500;
  }
  const status = readStatus(error);
  if (status === 408 || status === 409 || status === 429 || (status !== null && status >= 500)) {
    return true;
  }
  const code = readCode(error);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  if (error.message.startsWith("[STRUCTURED_OUTPUT:transport_error]")) {
    const statusMatch = error.message.match(/\]\s+(\d{3})\b/);
    const status = statusMatch ? Number(statusMatch[1]) : null;
    return status === null || status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return error.message === "fetch failed" || error.message === "socket hang up";
}
