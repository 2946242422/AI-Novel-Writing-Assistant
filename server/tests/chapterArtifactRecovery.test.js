const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterStreamGenerationOrchestrator,
} = require("../dist/services/novel/runtime/ChapterStreamGenerationOrchestrator.js");

function createOrchestrator(content) {
  let readinessChecks = 0;
  const orchestrator = new ChapterStreamGenerationOrchestrator({
    assembler: {
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: { id: "chapter-4", title: "第四章", order: 4, content, expectation: null },
          contextPackage: {
            chapter: { id: "chapter-4", title: "第四章", order: 4 },
            nextAction: "hold_for_review",
            pendingReviewProposalCount: 0,
            openAuditIssues: [{ description: "待修复问题" }],
          },
        };
      },
    },
    chapterWritingGraph: {},
    readinessService: {
      assertReady() {
        readinessChecks += 1;
        throw new Error("缺少章节执行合同");
      },
    },
    contentFinalizationService: {},
    agentRuntime: {},
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => {},
  });
  return { orchestrator, getReadinessChecks: () => readinessChecks };
}

test("已保存草稿恢复时不被正文生成前置合同再次阻断", async () => {
  const { orchestrator, getReadinessChecks } = createOrchestrator("已保存的第四章正文");

  const prepared = await orchestrator.prepareRuntimeChapter(
    "novel-1",
    "chapter-4",
    {},
    { allowExistingDraftRecovery: true },
  );

  assert.equal(prepared.assembled.chapter.content, "已保存的第四章正文");
  assert.equal(getReadinessChecks(), 0);
});

test("没有草稿时仍必须通过正文生成前置合同", async () => {
  const { orchestrator, getReadinessChecks } = createOrchestrator("");

  await assert.rejects(
    orchestrator.prepareRuntimeChapter(
      "novel-1",
      "chapter-4",
      {},
      { allowExistingDraftRecovery: true },
    ),
    /缺少章节执行合同/,
  );
  assert.equal(getReadinessChecks(), 1);
});
