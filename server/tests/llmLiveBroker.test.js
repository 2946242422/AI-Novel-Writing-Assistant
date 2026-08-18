const test = require("node:test");
const assert = require("node:assert/strict");

const { LlmLiveBroker } = require("../dist/platform/llm/live/LlmLiveBroker.js");
const { llmLiveBroker } = require("../dist/platform/llm/live/LlmLiveBroker.js");
const {
  publishRuntimeStepFailed,
  publishRuntimeStepStarted,
} = require("../dist/platform/llm/live/runtimeLiveSession.js");

test("LLM 实况会话按任务发布片段并保留最新快照", () => {
  const broker = new LlmLiveBroker();
  const taskOneEvents = [];
  const taskTwoEvents = [];
  const stopOne = broker.subscribe({ taskId: "task-1" }, (event) => taskOneEvents.push(event));
  const stopTwo = broker.subscribe({ taskId: "task-2" }, (event) => taskTwoEvents.push(event));

  const session = broker.begin({
    label: "章节正文",
    mode: "text",
    taskId: "task-1",
  });
  session.phase("streaming", "模型正在返回内容");
  session.delta("第一段");
  session.delta("第二段");
  session.complete();

  stopOne();
  stopTwo();

  assert.equal(taskTwoEvents.length, 0);
  assert.deepEqual(
    taskOneEvents.map((event) => event.type),
    ["session_started", "phase_changed", "output_delta", "output_delta", "phase_changed", "session_completed"],
  );
  assert.deepEqual(
    taskOneEvents.map((event) => event.seq),
    [1, 2, 3, 4, 5, 6],
  );
  const [snapshot] = broker.getSnapshots({ taskId: "task-1" });
  assert.equal(snapshot.preview, "第一段第二段");
  assert.equal(snapshot.totalChars, 6);
  assert.equal(snapshot.phase, "completed");
});

test("自动导演运行阶段在模型调用前也会进入 AI 实况", () => {
  const taskId = `runtime-task-${Date.now()}`;
  publishRuntimeStepStarted({
    taskId,
    novelId: "novel-1",
    nodeKey: "chapter_execution_contract_sync",
    label: "同步章节执行合同",
  });
  publishRuntimeStepFailed({
    taskId,
    novelId: "novel-1",
    nodeKey: "chapter_execution_contract_sync",
    label: "同步章节执行合同",
    error: "章节目标缺失",
  });

  const [snapshot] = llmLiveBroker.getSnapshots({ taskId });
  assert.equal(snapshot.context.mode, "runtime");
  assert.equal(snapshot.phase, "failed");
  assert.match(snapshot.preview, /章节目标缺失/);
});
