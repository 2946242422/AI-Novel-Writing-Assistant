import {
  estimateDirectorUnattendedCalls,
  normalizeDirectorUnattendedPolicy,
  type DirectorUnattendedPreflightCheck,
  type DirectorUnattendedPreflightReport,
} from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { parseSeedPayload } from "../../../workflow/novelWorkflow.shared";
import {
  getDirectorInputFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../runtime/novelDirectorHelpers";

const FALLBACK_AVERAGE_CALL_DURATION_MS = 90_000;
const FALLBACK_AVERAGE_TOKENS_PER_CALL = 8_000;

function check(
  id: string,
  label: string,
  level: DirectorUnattendedPreflightCheck["level"],
  message: string,
): DirectorUnattendedPreflightCheck {
  return { id, label, level, message };
}

function isCompletedChapter(chapter: {
  content: string | null;
  generationState: string | null;
  chapterStatus: string | null;
}): boolean {
  if (!chapter.content?.trim()) return false;
  return chapter.generationState === "approved"
    || chapter.generationState === "published"
    || chapter.chapterStatus === "completed";
}

function isRecoverableChapter(chapter: {
  content: string | null;
  generationState: string | null;
  chapterStatus: string | null;
}): boolean {
  return Boolean(chapter.content?.trim()) && !isCompletedChapter(chapter);
}

export class DirectorUnattendedPreflightService {
  async inspect(taskId: string): Promise<DirectorUnattendedPreflightReport> {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      include: {
        novel: {
          select: {
            id: true,
            estimatedChapterCount: true,
            chapters: {
              orderBy: { order: "asc" },
              select: {
                order: true,
                content: true,
                generationState: true,
                chapterStatus: true,
              },
            },
            generationJobs: {
              where: { status: { in: ["queued", "running"] } },
              select: { id: true, status: true },
            },
          },
        },
      },
    });
    if (!task || task.lane !== "auto_director") {
      throw new AppError("自动导演任务不存在。", 404);
    }
    if (!task.novelId || !task.novel) {
      throw new AppError("自动导演任务还没有绑定小说项目。", 409);
    }

    const seed = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seed);
    const plan = directorInput?.autoExecutionPlan ?? seed.autoExecutionPlan ?? null;
    const policy = normalizeDirectorUnattendedPolicy(plan?.unattendedPolicy);
    const chapters = task.novel.chapters;
    const completedChapterCount = chapters.filter(isCompletedChapter).length;
    const targetChapterCount = Math.max(
      completedChapterCount,
      seed.completionProfile?.targetChapterCount
        ?? directorInput?.completionProfile?.targetChapterCount
        ?? task.novel.estimatedChapterCount
        ?? chapters.length,
    );
    const remainingChapterCount = Math.max(0, targetChapterCount - completedChapterCount);
    const nextBatchChapterCount = Math.min(remainingChapterCount, policy.maxChaptersPerBatch);
    const autoReview = plan?.autoReview ?? true;
    const autoRepair = autoReview ? (plan?.autoRepair ?? true) : false;
    const bookEstimate = estimateDirectorUnattendedCalls({
      chapterCount: remainingChapterCount,
      autoReview,
      autoRepair,
    });
    const batchEstimate = estimateDirectorUnattendedCalls({
      chapterCount: nextBatchChapterCount,
      autoReview,
      autoRepair,
    });
    const usage = await prisma.directorLlmUsageRecord.aggregate({
      where: { taskId },
      _avg: {
        durationMs: true,
        totalTokens: true,
      },
      _count: { id: true },
    });
    const historicalAverageCallDurationMs = usage._count.id > 0
      ? Math.max(0, Math.round(usage._avg.durationMs ?? 0))
      : null;
    const historicalAverageTokensPerCall = usage._count.id > 0
      ? Math.max(0, Math.round(usage._avg.totalTokens ?? 0))
      : null;
    const averageCallDurationMs = historicalAverageCallDurationMs || FALLBACK_AVERAGE_CALL_DURATION_MS;
    const averageTokensPerCall = historicalAverageTokensPerCall || FALLBACK_AVERAGE_TOKENS_PER_CALL;
    const estimatedBatchTokens = batchEstimate.estimatedCalls * averageTokensPerCall;
    const estimatedBatchMinutes = Math.max(
      nextBatchChapterCount > 0 ? 1 : 0,
      Math.ceil((batchEstimate.estimatedCalls * averageCallDurationMs) / 60_000),
    );
    const recoverableChapter = chapters.find(isRecoverableChapter) ?? null;

    const checks: DirectorUnattendedPreflightCheck[] = [];
    checks.push(check(
      "model_route",
      "生成模型",
      directorInput?.provider && directorInput.model ? "pass" : "blocker",
      directorInput?.provider && directorInput.model
        ? `将沿用本任务的 ${directorInput.provider} / ${directorInput.model}`
        : "任务缺少可用的生成模型。",
    ));
    checks.push(check(
      "call_budget",
      "AI 调用预算",
      batchEstimate.estimatedCalls <= policy.maxBatchLlmCalls
        && batchEstimate.callsPerChapter <= policy.maxLlmCallsPerChapter
        ? "pass"
        : "blocker",
      [
        `下一批预计 ${batchEstimate.estimatedCalls} 次，每章约 ${batchEstimate.callsPerChapter} 次`,
        `上限为每批 ${policy.maxBatchLlmCalls} 次、每章 ${policy.maxLlmCallsPerChapter} 次。`,
      ].join("；"),
    ));
    checks.push(check(
      "duration_budget",
      "运行时长",
      estimatedBatchMinutes <= policy.maxBatchDurationMinutes ? "pass" : "warning",
      `根据本任务已有调用速度，下一批约 ${estimatedBatchMinutes} 分钟；超过 ${policy.maxBatchDurationMinutes} 分钟会在安全章节边界停止。`,
    ));
    checks.push(check(
      "artifact_recovery",
      "恢复位置",
      "pass",
      recoverableChapter
        ? `检测到第 ${recoverableChapter.order} 章安全草稿，将从审校或修复阶段继续，不重写已保存正文。`
        : "没有待恢复草稿，将从下一个未完成章节开始。",
    ));
    checks.push(check(
      "active_jobs",
      "重复任务",
      task.novel.generationJobs.length <= 1 ? "pass" : "warning",
      task.novel.generationJobs.length <= 1
        ? "未发现同一小说的重复运行批次。"
        : `当前有 ${task.novel.generationJobs.length} 个排队或运行批次，新批次会等待安全边界并复用已有任务。`,
    ));

    return {
      ready: checks.every((item) => item.level !== "blocker"),
      taskId,
      novelId: task.novelId,
      remainingChapterCount,
      nextBatchChapterCount,
      estimatedBookCalls: bookEstimate.estimatedCalls,
      estimatedBatchCalls: batchEstimate.estimatedCalls,
      estimatedBatchTokens,
      estimatedBatchMinutes,
      historicalAverageCallDurationMs,
      historicalAverageTokensPerCall,
      recoverableChapterOrder: recoverableChapter?.order ?? null,
      policy,
      checks,
    };
  }
}
