import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
  DirectorQualityDisposition,
  DirectorQualityRepairRisk,
} from "@ai-novel/shared/types/novelDirector";
import { DEFAULT_DIRECTOR_RISK_POLICY } from "@ai-novel/shared/types/directorRisk";
import { isDirectorAutoExecutionRunMode, isFullBookAutopilotRunMode } from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { buildNovelEditResumeTarget } from "../../workflow/novelWorkflow.shared";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  buildDirectorAutoExecutionDeferredQualityState,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  type DirectorAutoExecutionChapterRef,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import { buildDirectorSessionState } from "../runtime/novelDirectorHelpers";
import { PIPELINE_REPLAN_NOTICE_CODE, parsePipelinePayload } from "../../pipelineJobState";
import { buildDirectorQualityRepairRisk } from "../phases/novelDirectorQualityRepairRisk";
import type {
  DirectorRiskAssessmentInput,
  DirectorRiskDecision,
} from "../risk/DirectorRiskAssessmentService";

export type AutoExecutionResumeStage = "chapter" | "pipeline";

export interface AutoExecutionWorkflowCheckpointPort {
  bootstrapTask(input: {
    workflowTaskId: string;
    novelId: string;
    lane: "auto_director";
    title: string;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  recordCheckpoint(taskId: string, input: {
    stage: "quality_repair";
    checkpointType: "workflow_completed" | "chapter_batch_ready" | "replan_required";
    checkpointSummary: string;
    itemLabel: string;
    progress?: number;
    chapterId?: string | null;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface AutoExecutionCheckpointRuntimeDeps {
  workflowService: AutoExecutionWorkflowCheckpointPort;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  shouldAutoContinueQualityRepair?: (input: {
    request: DirectorConfirmRequest;
    qualityRepairRisk: DirectorQualityRepairRisk;
    remainingChapterCount: number;
  }) => Promise<boolean> | boolean;
  recordAutoApproval?: (input: {
    taskId: string;
    checkpointType: NovelWorkflowCheckpoint;
    qualityRepairRisk: DirectorQualityRepairRisk;
    checkpointSummary?: string | null;
  }) => Promise<unknown>;
  assessQualityRepair?: (
    input: Omit<DirectorRiskAssessmentInput,
      "failureStage" | "failureType" | "category" | "forcePause" | "localOnly"> & {
        qualityRepairRisk: DirectorQualityRepairRisk;
      },
  ) => Promise<DirectorRiskDecision | null>;
}

export interface AutoExecutionCheckpointBaseInput {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
}

export function resolveAutomatedQualityDisposition(input: {
  qualityRepairRisk: DirectorQualityRepairRisk;
  riskDecision: DirectorRiskDecision | null;
  explicitSkip: boolean;
  affectedChapterOrders: number[];
  fallbackReason?: string | null;
  decidedAt?: string;
}): DirectorQualityDisposition {
  const assessment = input.riskDecision?.assessment ?? null;
  const reason = assessment?.recommendationReason?.trim()
    || assessment?.evidenceSummary?.trim()
    || input.fallbackReason?.trim()
    || input.qualityRepairRisk.reason;
  const create = (
    action: DirectorQualityDisposition["action"],
    source: DirectorQualityDisposition["source"],
  ): DirectorQualityDisposition => ({
    action,
    reason,
    source,
    affectedChapterOrders: assessment?.affectedChapterOrders?.length
      ? assessment.affectedChapterOrders
      : input.affectedChapterOrders,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
  });

  if (input.explicitSkip) {
    return create("record_debt_and_continue", "explicit_user");
  }
  if (
    input.riskDecision?.shouldPause
    || assessment?.category === "protected_content"
    || assessment?.category === "data_integrity"
    || assessment?.category === "runtime_safety"
  ) {
    return create("pause_for_manual", "safety_guard");
  }
  if (assessment?.recommendation === "local_repair" || assessment?.recommendation === "retry") {
    return create("light_repair_and_continue", "ai_risk_assessment");
  }
  if (assessment?.recommendation === "record_quality_debt" || assessment?.recommendation === "continue") {
    return create("record_debt_and_continue", "ai_risk_assessment");
  }
  if (assessment?.recommendation === "replan") {
    return create("replan_adjacent_and_continue", "ai_risk_assessment");
  }
  if (assessment?.recommendation === "pause" || assessment?.recommendation === "stop") {
    return create("record_debt_and_continue", "ai_risk_assessment");
  }

  // 二次风险评估不可用时，继续消费上游已结构化的质量结论。
  // 这里只做安全后处理，不使用文本关键词重新猜测意图。
  if (input.qualityRepairRisk.riskLevel === "replan") {
    return create("replan_adjacent_and_continue", "structured_runtime");
  }
  if (input.qualityRepairRisk.autoContinuable) {
    return create("light_repair_and_continue", "structured_runtime");
  }
  return create("record_debt_and_continue", "structured_runtime");
}

export async function syncAutoExecutionTaskState(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    isBackgroundRunning: boolean;
    resumeStage?: AutoExecutionResumeStage;
  },
): Promise<void> {
  const directorSession = buildDirectorSessionState({
    runMode: input.request.runMode,
    phase: "chapter_execution",
    isBackgroundRunning: input.isBackgroundRunning,
  });
  const resumeTarget = buildNovelEditResumeTarget({
    novelId: input.novelId,
    taskId: input.taskId,
    stage: input.resumeStage ?? "pipeline",
    chapterId: input.autoExecution.nextChapterId ?? input.range.firstChapterId,
  });
  await deps.workflowService.bootstrapTask({
    workflowTaskId: input.taskId,
    novelId: input.novelId,
    lane: "auto_director",
    title: input.request.candidate.workingTitle,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession,
      resumeTarget,
      autoExecution: input.autoExecution,
    }),
  });
}

export async function recordCompletedCheckpoint(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId?: string | null;
    pipelineStatus?: PipelineJobStatus | null;
  },
): Promise<void> {
  const completedState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId ?? input.autoExecution.pipelineJobId ?? null,
    pipelineStatus: input.pipelineStatus ?? input.autoExecution.pipelineStatus ?? null,
  };
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(completedState, input.range.totalChapterCount);
  if (completedState.volumeChapterListComplete === false) {
    await deps.workflowService.recordCheckpoint(input.taskId, {
      stage: "quality_repair",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: `《${input.request.candidate.workingTitle.trim() || input.request.title?.trim() || "当前项目"}》已完成${scopeLabel}正文。继续后会补齐下一段章节规划并进入后续写作。`,
      itemLabel: `${scopeLabel}正文已完成，等待续拆下一段`,
      progress: 0.98,
      chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
      seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
        directorSession: buildDirectorSessionState({
          runMode: input.request.runMode,
          phase: "structured_outline",
          isBackgroundRunning: false,
        }),
        resumeTarget: buildNovelEditResumeTarget({
          novelId: input.novelId,
          taskId: input.taskId,
          stage: "structured",
          chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
        }),
        autoExecution: completedState,
      }),
    });
    return;
  }
  await deps.workflowService.recordCheckpoint(input.taskId, {
    stage: "quality_repair",
    checkpointType: "workflow_completed",
    checkpointSummary: buildDirectorAutoExecutionCompletedSummary({
      title: input.request.candidate.workingTitle.trim() || input.request.title?.trim() || "当前项目",
      scopeLabel,
      autoReview: completedState.autoReview,
      autoRepair: completedState.autoRepair,
    }),
    itemLabel: buildDirectorAutoExecutionCompletedLabel(scopeLabel),
    progress: 1,
    chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: buildDirectorSessionState({
        runMode: input.request.runMode,
        phase: "chapter_execution",
        isBackgroundRunning: false,
      }),
      resumeTarget: buildNovelEditResumeTarget({
        novelId: input.novelId,
        taskId: input.taskId,
        stage: "pipeline",
        chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
      }),
      autoExecution: completedState,
    }),
  });
}

export async function recordQualityRepairCheckpoint(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId: string;
    pipelineStatus: PipelineJobStatus;
    checkpointType: "chapter_batch_ready" | "replan_required";
    pauseMessage: string;
    qualityRepairRisk: DirectorQualityRepairRisk;
  },
): Promise<DirectorAutoExecutionState> {
  const checkpointState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId,
    pipelineStatus: input.pipelineStatus,
    qualityRepairRisk: input.qualityRepairRisk,
  };
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(checkpointState, input.range.totalChapterCount);
  await deps.workflowService.recordCheckpoint(input.taskId, {
    stage: "quality_repair",
    checkpointType: input.checkpointType,
    itemLabel: input.checkpointType === "replan_required"
      ? `${scopeLabel}等待处理重规划建议`
      : buildDirectorAutoExecutionPausedLabel(checkpointState),
    checkpointSummary: buildDirectorAutoExecutionPausedSummary({
      scopeLabel,
      remainingChapterCount: checkpointState.remainingChapterCount ?? 0,
      nextChapterOrder: checkpointState.nextChapterOrder ?? null,
      failureMessage: input.pauseMessage,
    }),
    chapterId: checkpointState.nextChapterId ?? input.range.firstChapterId,
    progress: 0.98,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: buildDirectorSessionState({
        runMode: input.request.runMode,
        phase: "chapter_execution",
        isBackgroundRunning: false,
      }),
      resumeTarget: buildNovelEditResumeTarget({
        novelId: input.novelId,
        taskId: input.taskId,
        stage: "pipeline",
        chapterId: checkpointState.nextChapterId ?? input.range.firstChapterId,
      }),
      autoExecution: checkpointState,
    }),
  });
  return checkpointState;
}

export async function resolveQualityRepairNoticeAction(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId: string;
    pipelineStatus: PipelineJobStatus;
    noticeCode?: string | null;
    noticeSummary: string;
    payload?: string | null;
    approveAutoExecutionScope?: boolean;
    skipCurrentQualityRepair?: boolean;
    qualityIssueChapter?: DirectorAutoExecutionChapterRef | null;
  },
): Promise<{
  action: "auto_continue" | "auto_replan" | "pause";
  checkpointType: "chapter_batch_ready" | "replan_required";
  checkpointState: DirectorAutoExecutionState;
  qualityRepairRisk: DirectorQualityRepairRisk;
}> {
  const checkpointType = input.noticeCode === PIPELINE_REPLAN_NOTICE_CODE
    ? "replan_required"
    : "chapter_batch_ready";
  const qualityRepairRisk = buildDirectorQualityRepairRisk({
    noticeCode: input.noticeCode,
    noticeSummary: input.noticeSummary,
    payload: input.payload,
    remainingChapterCount: input.autoExecution.remainingChapterCount ?? 0,
    totalChapterCount: input.range.totalChapterCount,
  });
  const parsedPayload = parsePipelinePayload(input.payload);
  const riskDecision = deps.assessQualityRepair ? await deps.assessQualityRepair({
    taskId: input.taskId,
    novelId: input.novelId,
    policy: input.request.riskPolicy ?? input.autoExecution.riskPolicy ?? DEFAULT_DIRECTOR_RISK_POLICY,
    qualityRepairRisk,
    failureSummary: input.noticeSummary,
    issueFingerprint: [
      "quality_repair",
      input.noticeCode ?? qualityRepairRisk.riskLevel,
      input.autoExecution.nextChapterId ?? input.autoExecution.nextChapterOrder ?? "book",
    ].join(":"),
    affectedChapterOrders: input.autoExecution.nextChapterOrder == null ? [] : [input.autoExecution.nextChapterOrder],
    failureDetails: {
      noticeCode: input.noticeCode ?? null,
      payload: parsedPayload,
      hasUsableChapterContent: Boolean(input.qualityIssueChapter?.content?.trim()),
    },
    taskContext: {
      runMode: input.request.runMode,
      remainingChapterCount: input.autoExecution.remainingChapterCount ?? 0,
    },
    auditReports: [
      ...(parsedPayload.qualityAlertDetails ?? []).map((detail) => ({ type: "quality_alert", detail })),
      ...(parsedPayload.replanAlertDetails ?? []).map((detail) => ({ type: "replan_alert", detail })),
      ...(parsedPayload.recoverableRepairDetails ?? []).map((detail) => ({ type: "recoverable_repair", detail })),
    ],
    existingQualityDebt: input.autoExecution.qualityDebtSummaries ?? [],
    provider: input.request.provider,
    model: input.request.model,
    temperature: input.request.temperature,
  }) : null;
  const affectedChapterOrders = input.autoExecution.nextChapterOrder == null
    ? []
    : [input.autoExecution.nextChapterOrder];
  const isAiDriverExecution = isDirectorAutoExecutionRunMode(input.request.runMode);
  const isFullBookAutopilot = isFullBookAutopilotRunMode(input.request.runMode);
  const canSkipCurrentQualityRepair = Boolean(
    input.skipCurrentQualityRepair
    && isAiDriverExecution,
  );
  const disposition = resolveAutomatedQualityDisposition({
    qualityRepairRisk,
    riskDecision,
    explicitSkip: canSkipCurrentQualityRepair,
    affectedChapterOrders,
    fallbackReason: input.noticeSummary,
  });
  const checkpointState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId,
    pipelineStatus: input.pipelineStatus,
    qualityRepairRisk,
    riskPolicy: input.request.riskPolicy ?? input.autoExecution.riskPolicy ?? DEFAULT_DIRECTOR_RISK_POLICY,
    latestRiskAssessment: riskDecision?.assessment ?? input.autoExecution.latestRiskAssessment ?? null,
    latestQualityDisposition: disposition,
  };
  const remainingChapterCount = checkpointState.remainingChapterCount ?? 0;
  const hasQualityAlertDetails = (parsedPayload.qualityAlertDetails?.length ?? 0) > 0;
  const shouldNotifyAndContinueAiDriverQualityNotice = checkpointType === "chapter_batch_ready"
    && qualityRepairRisk.autoContinuable
    && isAiDriverExecution
    && hasQualityAlertDetails;
  const canContinueAfterExplicitApproval = Boolean(
    input.approveAutoExecutionScope
    && checkpointType === "chapter_batch_ready"
    && remainingChapterCount > 0
    && isAiDriverExecution,
  );
  const canAutoContinueByPolicy = checkpointType === "chapter_batch_ready"
    && remainingChapterCount > 0
    && (
      isFullBookAutopilot
      || shouldNotifyAndContinueAiDriverQualityNotice
      || await deps.shouldAutoContinueQualityRepair?.({
        request: input.request,
        qualityRepairRisk,
        remainingChapterCount,
      })
    );

  if (isFullBookAutopilot && remainingChapterCount > 0) {
    if (disposition.action === "pause_for_manual") {
      return {
        action: "pause",
        checkpointType,
        checkpointState,
        qualityRepairRisk,
      };
    }
    if (disposition.action === "replan_adjacent_and_continue") {
      return {
        action: "auto_replan",
        checkpointType,
        checkpointState,
        qualityRepairRisk,
      };
    }
    await deps.recordAutoApproval?.({
      taskId: input.taskId,
      checkpointType,
      qualityRepairRisk,
      checkpointSummary: disposition.reason,
    });
    if (disposition.action === "record_debt_and_continue") {
      return {
        action: "auto_continue",
        checkpointType,
        checkpointState: buildDirectorAutoExecutionDeferredQualityState({
          state: checkpointState,
          reason: disposition.reason,
          source: canSkipCurrentQualityRepair ? "review_skip" : "quality_loop",
          chapter: input.qualityIssueChapter ?? null,
        }),
        qualityRepairRisk,
      };
    }
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState,
      qualityRepairRisk,
    };
  }

  if (canAutoContinueByPolicy || shouldNotifyAndContinueAiDriverQualityNotice) {
    await deps.recordAutoApproval?.({
      taskId: input.taskId,
      checkpointType,
      qualityRepairRisk,
      checkpointSummary: input.noticeSummary,
    });
  }

  if (!riskDecision?.shouldPause && (canContinueAfterExplicitApproval || canAutoContinueByPolicy)) {
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState,
      qualityRepairRisk,
    };
  }

  // `auto_execute_range` is an explicit instruction to keep the automated
  // production lane moving. A usable draft is retained as quality debt even
  // when the review classifier escalates it to a replan notice; otherwise a
  // simple-creation recovery would immediately re-enter the same checkpoint.
  if (canSkipCurrentQualityRepair) {
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState: buildDirectorAutoExecutionDeferredQualityState({
        state: checkpointState,
        reason: input.noticeSummary,
        source: "review_skip",
        chapter: input.qualityIssueChapter ?? null,
      }),
      qualityRepairRisk,
    };
  }

  if (!riskDecision?.shouldPause && shouldNotifyAndContinueAiDriverQualityNotice) {
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState,
      qualityRepairRisk,
    };
  }

  return {
    action: "pause",
    checkpointType,
    checkpointState,
    qualityRepairRisk,
  };
}
