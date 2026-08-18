const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectLocalReadabilityAdvisories,
} = require("../dist/services/novel/quality/readability/LocalReadabilityAdvisory.js");

test("local readability checks report mobile formatting friction as non-blocking advice", () => {
  const content = Array.from({ length: 9 }, (_, index) => `他抬头。${index}`).join("\n");
  const issues = detectLocalReadabilityAdvisories(content);

  assert.ok(issues.some((issue) => issue.category === "pacing"));
  assert.ok(issues.every((issue) => issue.severity === "low"));
});

test("local readability checks keep ordinary prose free of synthetic warnings", () => {
  const content = [
    "沈令嘉将婚书放在桌面，没有立刻追问那道墨迹。",
    "院外的雨压低了檐下风铃，她先让管事核对嫁妆单子，自己留在原地看着众人的反应。",
    "她知道谁在说谎，但此刻揭穿并不能让她带走全部东西。",
  ].join("\n");

  assert.deepEqual(detectLocalReadabilityAdvisories(content), []);
});
