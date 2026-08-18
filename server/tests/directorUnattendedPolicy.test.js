const test = require("node:test");
const assert = require("node:assert/strict");

test("无人值守预检会显式计算每章和整批 AI 调用", async () => {
  const {
    estimateDirectorUnattendedCalls,
    normalizeDirectorUnattendedPolicy,
  } = await import("../../shared/dist/types/novel/unattended.js");
  const policy = normalizeDirectorUnattendedPolicy(null);
  const estimate = estimateDirectorUnattendedCalls({
    chapterCount: policy.maxChaptersPerBatch,
    autoReview: true,
    autoRepair: true,
  });

  assert.equal(estimate.callsPerChapter, 11);
  assert.equal(estimate.estimatedCalls, 55);
  assert.ok(estimate.estimatedCalls <= policy.maxBatchLlmCalls);
});

test("旧任务没有无人值守配置时使用安全默认值", async () => {
  const { normalizeDirectorUnattendedPolicy } = await import("../../shared/dist/types/novel/unattended.js");
  const policy = normalizeDirectorUnattendedPolicy({
    maxChaptersPerBatch: 999,
    maxStageRetries: -5,
    stageTimeoutSeconds: 10,
  });

  assert.equal(policy.maxChaptersPerBatch, 20);
  assert.equal(policy.maxStageRetries, 0);
  assert.equal(policy.stageTimeoutSeconds, 30);
  assert.equal(policy.recoveryStrategy, "artifact_first");
});
