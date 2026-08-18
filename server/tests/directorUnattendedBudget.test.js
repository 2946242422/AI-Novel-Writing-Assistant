const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateUnattendedProductionBudget,
  isTransientProductionError,
} = require("../dist/services/novel/production/unattended/UnattendedProductionBudget.js");

const policy = {
  version: 1,
  maxChaptersPerBatch: 5,
  maxLlmCallsPerChapter: 12,
  maxBatchLlmCalls: 60,
  maxBatchDurationMinutes: 120,
  maxConsecutiveFailures: 1,
  maxStageRetries: 1,
  stageTimeoutSeconds: 360,
  maxOutputTokens: 8192,
  recoveryStrategy: "artifact_first",
  localReadabilityChecks: "advisory",
  telemetryMode: "unified_live",
};

test("unattended budget stops only after a safe chapter boundary exceeds its call limit", () => {
  const decision = evaluateUnattendedProductionBudget({
    policy,
    chapterOrder: 4,
    snapshot: {
      batchCallCount: 13,
      chapterCallCount: 13,
      elapsedMinutes: 10,
    },
  });

  assert.equal(decision.exceeded, true);
  assert.equal(decision.reason, "chapter_call_limit");
  assert.match(decision.message, /当前正文已安全保存/);
});

test("unattended budget allows work that remains inside every limit", () => {
  const decision = evaluateUnattendedProductionBudget({
    policy,
    chapterOrder: 4,
    snapshot: {
      batchCallCount: 11,
      chapterCallCount: 11,
      elapsedMinutes: 30,
    },
  });

  assert.deepEqual(decision, { exceeded: false, reason: null, message: null });
});

test("production retry policy accepts transport failures but rejects deterministic contract failures", () => {
  assert.equal(isTransientProductionError(new Error("[STRUCTURED_OUTPUT:transport_error] 503")), true);
  assert.equal(isTransientProductionError(new Error("[STRUCTURED_OUTPUT:transport_error] 403")), false);
  assert.equal(isTransientProductionError(Object.assign(new Error("rate limited"), { status: 429 })), true);
  assert.equal(isTransientProductionError(new Error("章节执行合同缺少章节目标")), false);
});
