export type ModelAttentionIssueKind = "authentication" | "quota" | "rate_limit" | "unavailable";

export interface ModelAttentionIssue {
  kind: ModelAttentionIssueKind;
  title: string;
  message: string;
}

function normalizeFailureText(input: {
  failureCode?: string | null;
  failureSummary?: string | null;
  lastError?: string | null;
}): string {
  return [input.failureCode, input.failureSummary, input.lastError]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

/**
 * Detect only failures that require changing or restoring the selected model route.
 * Generic transport failures, malformed JSON and temporary 5xx responses remain eligible
 * for automatic recovery because retrying or repairing those does not require user input.
 */
export function resolveModelAttentionIssue(input: {
  failureCode?: string | null;
  failureSummary?: string | null;
  lastError?: string | null;
}): ModelAttentionIssue | null {
  const text = normalizeFailureText(input);
  if (!text) return null;

  if (/(?:unauthori[sz]ed|invalid[_ -]?(?:api[_ -]?)?key|api[_ -]?key[^\n]{0,24}(?:invalid|missing|expired)|(?:\b401\b|\b403\b)[^\n]{0,80}(?:api[_ -]?key|auth|credential|token)|鉴权|认证失败|密钥[^\n]{0,12}(?:无效|过期|缺失))/iu.test(text)) {
    return {
      kind: "authentication",
      title: "模型连接需要处理",
      message: "当前模型的密钥或访问权限不可用。请在“模型设置”中更新配置，连接恢复后再继续。",
    };
  }

  if (/(?:\b402\b|insufficient[_ -]?quota|quota[^\n]{0,24}(?:exceeded|insufficient)|billing|payment required|余额不足|余额已用完|额度不足|额度已用完|欠费)/iu.test(text)) {
    return {
      kind: "quota",
      title: "模型额度需要处理",
      message: "当前模型的余额或调用额度不足。补充额度或切换可用模型后即可继续。",
    };
  }

  if (/(?:\b429\b|rate[_ -]?limit|too many requests|请求过于频繁|达到限流|触发限流)/iu.test(text)) {
    return {
      kind: "rate_limit",
      title: "模型暂时限流",
      message: "当前模型正在限流。请稍后再继续，或在“模型设置”中切换到可用模型。",
    };
  }

  if (/(?:runtime[._ -]model[._ -]unavailable|model[_ -]unavailable|模型不可用|模型已下线|model not found)/iu.test(text)) {
    return {
      kind: "unavailable",
      title: "模型不可用",
      message: "任务绑定的模型当前不可用。请在“模型设置”中选择可用模型后再继续。",
    };
  }

  return null;
}
