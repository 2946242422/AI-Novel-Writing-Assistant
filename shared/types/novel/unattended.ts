export const DIRECTOR_UNATTENDED_POLICY_VERSION = 1 as const;

export interface DirectorUnattendedPolicy {
  version: typeof DIRECTOR_UNATTENDED_POLICY_VERSION;
  maxChaptersPerBatch: number;
  maxLlmCallsPerChapter: number;
  maxBatchLlmCalls: number;
  maxBatchDurationMinutes: number;
  maxConsecutiveFailures: number;
  maxStageRetries: number;
  stageTimeoutSeconds: number;
  maxOutputTokens: number;
  recoveryStrategy: "artifact_first";
  localReadabilityChecks: "advisory";
  telemetryMode: "unified_live";
}

export const DEFAULT_DIRECTOR_UNATTENDED_POLICY = {
  version: DIRECTOR_UNATTENDED_POLICY_VERSION,
  maxChaptersPerBatch: 5,
  maxLlmCallsPerChapter: 12,
  maxBatchLlmCalls: 60,
  maxBatchDurationMinutes: 120,
  maxConsecutiveFailures: 1,
  maxStageRetries: 1,
  stageTimeoutSeconds: 360,
  maxOutputTokens: 8_192,
  recoveryStrategy: "artifact_first",
  localReadabilityChecks: "advisory",
  telemetryMode: "unified_live",
} as const satisfies DirectorUnattendedPolicy;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

export function normalizeDirectorUnattendedPolicy(
  value: Partial<DirectorUnattendedPolicy> | null | undefined,
): DirectorUnattendedPolicy {
  return {
    version: DIRECTOR_UNATTENDED_POLICY_VERSION,
    maxChaptersPerBatch: clampInteger(value?.maxChaptersPerBatch, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxChaptersPerBatch, 1, 20),
    maxLlmCallsPerChapter: clampInteger(value?.maxLlmCallsPerChapter, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxLlmCallsPerChapter, 3, 30),
    maxBatchLlmCalls: clampInteger(value?.maxBatchLlmCalls, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxBatchLlmCalls, 10, 300),
    maxBatchDurationMinutes: clampInteger(value?.maxBatchDurationMinutes, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxBatchDurationMinutes, 10, 720),
    maxConsecutiveFailures: clampInteger(value?.maxConsecutiveFailures, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxConsecutiveFailures, 1, 5),
    maxStageRetries: clampInteger(value?.maxStageRetries, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxStageRetries, 0, 5),
    stageTimeoutSeconds: clampInteger(value?.stageTimeoutSeconds, DEFAULT_DIRECTOR_UNATTENDED_POLICY.stageTimeoutSeconds, 30, 600),
    maxOutputTokens: clampInteger(value?.maxOutputTokens, DEFAULT_DIRECTOR_UNATTENDED_POLICY.maxOutputTokens, 512, 32_768),
    recoveryStrategy: "artifact_first",
    localReadabilityChecks: "advisory",
    telemetryMode: "unified_live",
  };
}

export interface DirectorUnattendedCallEstimate {
  planningCalls: number;
  draftCalls: number;
  reviewCalls: number;
  repairReserveCalls: number;
  settlementCalls: number;
  callsPerChapter: number;
  chapterCount: number;
  estimatedCalls: number;
}

export function estimateDirectorUnattendedCalls(input: {
  chapterCount: number;
  autoReview?: boolean;
  autoRepair?: boolean;
}): DirectorUnattendedCallEstimate {
  const chapterCount = Math.max(0, Math.round(input.chapterCount));
  const planningCalls = 2;
  const draftCalls = 1;
  const reviewCalls = input.autoReview === false ? 1 : 2;
  const repairReserveCalls = input.autoReview === false || input.autoRepair === false ? 0 : 3;
  const settlementCalls = 3;
  const callsPerChapter = planningCalls
    + draftCalls
    + reviewCalls
    + repairReserveCalls
    + settlementCalls;
  return {
    planningCalls,
    draftCalls,
    reviewCalls,
    repairReserveCalls,
    settlementCalls,
    callsPerChapter,
    chapterCount,
    estimatedCalls: callsPerChapter * chapterCount,
  };
}

export type DirectorUnattendedPreflightLevel = "pass" | "warning" | "blocker";

export interface DirectorUnattendedPreflightCheck {
  id: string;
  label: string;
  level: DirectorUnattendedPreflightLevel;
  message: string;
}

export interface DirectorUnattendedPreflightReport {
  ready: boolean;
  taskId: string;
  novelId: string;
  remainingChapterCount: number;
  nextBatchChapterCount: number;
  estimatedBookCalls: number;
  estimatedBatchCalls: number;
  estimatedBatchTokens: number;
  estimatedBatchMinutes: number;
  historicalAverageCallDurationMs: number | null;
  historicalAverageTokensPerCall: number | null;
  recoverableChapterOrder: number | null;
  policy: DirectorUnattendedPolicy;
  checks: DirectorUnattendedPreflightCheck[];
}
