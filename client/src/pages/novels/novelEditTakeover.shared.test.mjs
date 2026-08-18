import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutoResolveQualityActionLabel,
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

test("quality recovery exposes one AI-first continuation action", () => {
  assert.equal(
    buildAutoResolveQualityActionLabel(false),
    "让 AI 处理并继续",
  );
  assert.equal(buildAutoResolveQualityActionLabel(true), "AI 正在判断并继续...");
});
