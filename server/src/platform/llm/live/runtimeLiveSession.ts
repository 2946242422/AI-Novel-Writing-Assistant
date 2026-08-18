import { llmLiveBroker, LlmLiveSession } from "./LlmLiveBroker";

interface RuntimeLiveInput {
  taskId: string;
  novelId?: string | null;
  nodeKey: string;
  label: string;
  targetId?: string | null;
}

function interactionId(input: RuntimeLiveInput): string {
  return ["runtime", input.taskId, input.nodeKey, input.targetId ?? "global"].join(":");
}

function getOrBegin(input: RuntimeLiveInput): LlmLiveSession {
  const id = interactionId(input);
  const existing = llmLiveBroker.getSnapshots({ interactionId: id })[0];
  if (existing && !["completed", "failed", "cancelled"].includes(existing.phase)) {
    return new LlmLiveSession(llmLiveBroker, id);
  }
  return llmLiveBroker.begin({
    interactionId: id,
    label: `自动导演 · ${input.label}`,
    mode: "runtime",
    taskId: input.taskId,
    novelId: input.novelId ?? null,
    stage: input.nodeKey,
    itemKey: input.targetId ?? null,
    provider: null,
    model: null,
  });
}

export function publishRuntimeStepStarted(input: RuntimeLiveInput): void {
  const session = getOrBegin(input);
  session.phase("applying", input.label);
  session.delta(`${input.label}\n`);
}

export function publishRuntimeStepCompleted(input: RuntimeLiveInput): void {
  const session = getOrBegin(input);
  session.delta(`${input.label}完成。\n`);
  session.complete();
}

export function publishRuntimeStepFailed(input: RuntimeLiveInput & { error: string }): void {
  const session = getOrBegin(input);
  session.delta(`${input.label}失败：${input.error}\n`);
  session.fail(new Error(input.error));
}

export function publishRuntimeResumed(input: {
  taskId: string;
  novelId?: string | null;
  summary: string;
}): void {
  const session = llmLiveBroker.begin({
    label: "自动导演 · 恢复任务",
    mode: "runtime",
    taskId: input.taskId,
    novelId: input.novelId ?? null,
    stage: "runtime_resume",
    itemKey: null,
    provider: null,
    model: null,
  });
  session.delta(`${input.summary}\n`);
  session.complete();
}
