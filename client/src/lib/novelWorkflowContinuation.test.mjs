import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDirectorContinueMode,
  resolveWorkflowContinuationFeedback,
} from "./novelWorkflowContinuation.ts";

test("replan recovery returns to AI disposition instead of forcing a quality skip", () => {
  assert.equal(resolveDirectorContinueMode({
    checkpointType: "replan_required",
    currentItemKey: "quality_repair",
    currentStage: "质量修复",
    pendingManualRecovery: false,
  }), "resume");
});

test("AI disposition recovery explains the automatic next step", () => {
  const feedback = resolveWorkflowContinuationFeedback(null, { mode: "resume" });
  assert.equal(feedback.tone, "success");
  assert.match(feedback.message, /AI.*轻修.*相邻章节/);
});
