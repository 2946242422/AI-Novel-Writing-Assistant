const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAutoDirectorFollowUpReason,
} = require("../dist/services/task/autoDirectorFollowUps/autoDirectorFollowUpReasonResolver.js");

function actionCodes(result) {
  return result.availableActions.map((item) => item.code);
}

test("follow-up resolver prefers manual recovery over other signals", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "chapter_batch_ready",
    pendingManualRecovery: true,
  });

  assert.ok(result);
  assert.equal(result.reason, "manual_recovery_required");
  assert.equal(result.priority, "P0");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "continue_generic", "open_detail"]);
  assert.equal(result.supportsBatch, false);
});

test("follow-up resolver returns candidate selection metadata", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "candidate_selection_required",
    pendingManualRecovery: false,
  });

  assert.ok(result);
  assert.equal(result.reason, "candidate_selection_required");
  assert.equal(result.priority, "P1");
  assert.deepEqual(actionCodes(result), ["go_candidate_selection", "open_detail"]);
});

test("follow-up resolver returns replan metadata", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "replan_required",
  });

  assert.ok(result);
  assert.equal(result.reason, "replan_required");
  assert.equal(result.priority, "P1");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "continue_auto_execution", "go_replan", "open_detail"]);
  assert.equal(result.availableActions[0].riskLevel, "low");
  assert.equal(result.availableActions[0].requiresConfirm, false);
  assert.equal(result.availableActions[0].label, "AI 自动处理并继续");
  assert.equal(result.supportsBatch, false);
});

test("manual recovery at a replan checkpoint keeps the single AI-first action", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "replan_required",
    pendingManualRecovery: true,
  });

  assert.ok(result);
  assert.equal(result.reason, "manual_recovery_required");
  assert.equal(result.availableActions[0].code, "auto_resolve_and_continue");
  assert.equal(result.availableActions[0].label, "AI 自动处理并继续");
});

test("follow-up resolver keeps failed replan checkpoints on recovery actions", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "replan_required",
  });

  assert.ok(result);
  assert.equal(result.reason, "replan_required");
  assert.equal(result.priority, "P0");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "continue_auto_execution", "go_replan", "open_detail"]);
});

test("follow-up resolver exposes chapter-batch auto-execution metadata", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
    executionScopeLabel: "第 11-20 章",
  });

  assert.ok(result);
  assert.equal(result.reason, "chapter_batch_execution_pending");
  assert.equal(result.priority, "P2");
  assert.equal(result.availableActions[0].code, "auto_resolve_and_continue");
  assert.equal(result.availableActions[0].kind, "mutation");
  assert.equal(result.availableActions[0].riskLevel, "low");
  assert.equal(result.availableActions[0].requiresConfirm, false);
  assert.equal(result.availableActions[0].label, "AI 自动处理并继续");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "continue_auto_execution", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, ["auto_resolve_and_continue"]);
  assert.equal(result.supportsBatch, true);
});

test("follow-up resolver keeps waiting chapter batches in auto-execution continuation state", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
  });

  assert.ok(result);
  assert.equal(result.reason, "chapter_batch_execution_pending");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "continue_auto_execution", "open_detail"]);
});

test("follow-up resolver exposes retry metadata for failed tasks", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "chapter_batch_ready",
  });

  assert.ok(result);
  assert.equal(result.reason, "runtime_failed");
  assert.equal(result.priority, "P0");
  assert.deepEqual(actionCodes(result), ["auto_resolve_and_continue", "retry_with_task_model", "retry_with_route_model", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, ["auto_resolve_and_continue"]);
  assert.equal(result.supportsBatch, true);
});
