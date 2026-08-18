import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSkipQualityRepairActionLabel,
  buildTakeoverDescription,
  buildTakeoverTitle,
} from "./novelEditTakeover.shared.ts";

test("failed replan checkpoints explain the recoverable quality decision", () => {
  assert.equal(buildTakeoverTitle({
    mode: "failed",
    novelTitle: "雾港巡夜人",
    checkpointType: "replan_required",
    scopeLabel: "全书",
  }), "《雾港巡夜人》需要处理质量建议");

  assert.match(buildTakeoverDescription({
    mode: "failed",
    checkpointType: "replan_required",
    reviewScope: null,
    scopeLabel: "全书",
  }), /当前章节已保存/);
});

test("quality recovery label states both consequence and recovery point", () => {
  assert.equal(
    buildSkipQualityRepairActionLabel("全书", false),
    "跳过本次质量建议，从最近进度恢复",
  );
  assert.equal(buildSkipQualityRepairActionLabel("全书", true), "正在从最近进度恢复...");
});
