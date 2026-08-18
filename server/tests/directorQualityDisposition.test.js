const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAutomatedQualityDisposition,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionCheckpointRuntime.js");

function riskDecision(recommendation, overrides = {}) {
  return {
    shouldNotify: false,
    shouldPause: false,
    assessment: {
      score: 4,
      category: "chapter_repair",
      impactScope: "current_chapter",
      affectedChapterOrders: [2],
      evidenceSummary: "AI 已结合审校与运行事实完成处置判断。",
      recommendation,
      recommendationReason: "结构化风险评估结论。",
      canPause: false,
      action: "logged",
      assessedAt: "2026-08-18T00:00:00.000Z",
      ...overrides,
    },
  };
}

const lowRisk = {
  riskLevel: "low",
  autoContinuable: true,
  reason: "本章可局部修复。",
};

test("AI quality disposition chooses light repair for small local issues", () => {
  const result = resolveAutomatedQualityDisposition({
    qualityRepairRisk: lowRisk,
    riskDecision: riskDecision("local_repair"),
    explicitSkip: false,
    affectedChapterOrders: [2],
  });

  assert.equal(result.action, "light_repair_and_continue");
  assert.equal(result.source, "ai_risk_assessment");
});

test("AI quality disposition records suspected false positives as quality debt", () => {
  const result = resolveAutomatedQualityDisposition({
    qualityRepairRisk: lowRisk,
    riskDecision: riskDecision("record_quality_debt"),
    explicitSkip: false,
    affectedChapterOrders: [2],
  });

  assert.equal(result.action, "record_debt_and_continue");
});

test("AI quality disposition replans adjacent chapters for plan misalignment", () => {
  const result = resolveAutomatedQualityDisposition({
    qualityRepairRisk: {
      riskLevel: "replan",
      autoContinuable: false,
      reason: "章节目标与当前计划窗口失配。",
    },
    riskDecision: riskDecision("replan", {
      category: "replan",
      impactScope: "chapter_range",
      affectedChapterOrders: [1, 2, 3],
    }),
    explicitSkip: false,
    affectedChapterOrders: [2],
  });

  assert.equal(result.action, "replan_adjacent_and_continue");
  assert.deepEqual(result.affectedChapterOrders, [1, 2, 3]);
});

test("AI quality disposition pauses only when the structured safety decision requires it", () => {
  const result = resolveAutomatedQualityDisposition({
    qualityRepairRisk: {
      riskLevel: "replan",
      autoContinuable: false,
      reason: "存在严重事实冲突。",
    },
    riskDecision: {
      ...riskDecision("pause", {
        score: 8,
        category: "data_integrity",
        impactScope: "novel",
        canPause: true,
      }),
      shouldPause: true,
    },
    explicitSkip: false,
    affectedChapterOrders: [2],
  });

  assert.equal(result.action, "pause_for_manual");
  assert.equal(result.source, "safety_guard");
});
