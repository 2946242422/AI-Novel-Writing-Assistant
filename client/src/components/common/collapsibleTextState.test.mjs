import test from "node:test";
import assert from "node:assert/strict";

import { shouldCollapseText } from "./collapsibleTextState.ts";

test("keeps short status messages fully visible", () => {
  assert.equal(shouldCollapseText("模型暂时不可用，请稍后重试。"), false);
});

test("collapses long transport responses", () => {
  const htmlResponse = `[STRUCTURED_OUTPUT:transport_error] 403 ${"<div>gateway diagnostic</div>".repeat(20)}`;
  assert.equal(shouldCollapseText(htmlResponse), true);
});

test("collapses multi-line logs even when individual lines are short", () => {
  assert.equal(shouldCollapseText("1\n2\n3\n4\n5\n6\n7"), true);
});
