import type { DirectorDashboardView, DirectorRuntimeProjection } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import type { UnifiedTaskDetail, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import type { ModelAttentionIssue } from "@ai-novel/shared/types/modelAttention";
import { Link } from "react-router-dom";
import DirectorRuntimeProjectionCard from "@/components/autoDirector/DirectorRuntimeProjectionCard";
import {
  TaskQueueActionRow,
  TaskQueueImpactNotice,
  TaskQueueSection,
  TaskQueueStatusBadge,
  type TaskQueueSeverity,
} from "@/components/taskQueue";
import { Button } from "@/components/ui/button";
import { CollapsibleText } from "@/components/common/CollapsibleText";
import { WorkspaceStateNotice, type WorkspaceTone } from "@/components/workspace";
import TaskCenterDetailSummary from "./TaskCenterDetailSummary";
import TaskCenterMilestoneHistory from "./TaskCenterMilestoneHistory";

export interface TaskCenterActionSpec {
  key: string;
  title: string;
  label: string;
  consequence: string;
  tone?: WorkspaceTone;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  onClick: () => void;
}

interface InlineTaskAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface TaskCenterDetailPanelProps {
  task?: UnifiedTaskDetail | null;
  loading: boolean;
  errorMessage?: string | null;
  onRetryLoad: () => void;
  isAutoDirectorTask: boolean;
  currentModelLabel: string;
  dashboardView?: DirectorDashboardView | null;
  runtimeProjection?: DirectorRuntimeProjection | null;
  noticeAction?: InlineTaskAction | null;
  noticeSeverity: TaskQueueSeverity;
  noticeTitle: string;
  failureAction?: InlineTaskAction | null;
  priorityFailureActions?: InlineTaskAction[];
  failureIsQualityReminder: boolean;
  modelAttention?: ModelAttentionIssue | null;
  actions: TaskCenterActionSpec[];
  steps: UnifiedTaskStep[];
  milestones: NovelWorkflowMilestone[];
}

export default function TaskCenterDetailPanel(props: TaskCenterDetailPanelProps) {
  const task = props.task;
  const hasAutomaticRecovery = Boolean(props.priorityFailureActions?.length);
  const hasFailureSignal = Boolean(task && (hasAutomaticRecovery
    || props.modelAttention
    || task.failureCode
    || task.failureSummary
    || (task.status === "failed" && task.lastError)
  ));
  const failureTitle = props.modelAttention?.title
    ?? (props.isAutoDirectorTask ? "AI 可自动处理" : props.failureIsQualityReminder ? "质量提醒" : "任务阻塞");
  const failureDescription = props.modelAttention?.message
    ?? (props.isAutoDirectorTask
      ? "AI 会判断是继续修复、重规划、从检查点恢复还是重新执行，并在处理后自动续写。"
      : task?.failureSummary ?? task?.lastError ?? "任务记录了需要处理的状态。");

  const actionRows = task ? (
    <div className="space-y-2">
      {(props.isAutoDirectorTask ? [] : props.actions).map((action) => (
        <TaskQueueActionRow
          key={action.key}
          title={action.title}
          consequence={action.consequence}
          tone={action.tone}
          action={(
            <Button
              size="sm"
              variant={action.variant ?? "outline"}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        />
      ))}
      <TaskQueueActionRow
        title="打开来源页面"
        consequence="只打开任务来源，不会改变任务状态。"
        action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>打开来源页面</Link></Button>}
      />
    </div>
  ) : null;

  return (
    <TaskQueueSection
      title="任务详情"
      description="查看当前影响和推荐动作，运行参数按需展开。"
      className="overflow-hidden rounded-2xl border-border/40 bg-card/60 shadow-[0_12px_36px_rgba(15,23,42,0.035)]"
    >
      <div className="space-y-4 text-sm">
        {props.loading ? (
          <WorkspaceStateNotice loading title="正在读取任务详情" description="正在同步任务状态、检查点和最近步骤。" />
        ) : null}
        {props.errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title="任务详情读取失败"
            description={props.errorMessage}
            action={<Button size="sm" variant="outline" onClick={props.onRetryLoad}>重新读取</Button>}
          />
        ) : null}
        {!props.loading && !props.errorMessage && !task ? (
          <WorkspaceStateNotice title="请选择一个任务" description="从任务列表选择一项后，可查看影响范围、恢复位置和可执行动作。" />
        ) : null}

        {task ? (
          <>
            <TaskCenterDetailSummary
              task={task}
              isAutoDirectorTask={props.isAutoDirectorTask}
              currentModelLabel={props.currentModelLabel}
              dashboardView={props.dashboardView}
            />

            {task.noticeCode || task.noticeSummary ? (
              <TaskQueueImpactNotice
                severity={props.noticeSeverity}
                title={props.noticeTitle}
                description={task.noticeSummary ?? "任务已记录一条需要查看的结果提醒。"}
                action={props.noticeAction ? (
                  <Button size="sm" variant="outline" disabled={props.noticeAction.disabled} onClick={props.noticeAction.onClick}>
                    {props.noticeAction.label}
                  </Button>
                ) : undefined}
              />
            ) : null}

            {hasFailureSignal ? (
              <TaskQueueImpactNotice
                severity={props.modelAttention ? "blocking" : props.failureIsQualityReminder ? "quality" : "blocking"}
                title={failureTitle}
                description={failureDescription}
                action={!props.modelAttention && (props.priorityFailureActions?.length || props.failureAction) ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {props.priorityFailureActions?.map((action, index) => (
                      <Button
                        key={`${action.label}-${index}`}
                        size="sm"
                        variant={index === 0 ? "default" : "outline"}
                        disabled={action.disabled}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    ))}
                    {props.failureAction ? (
                      <Button size="sm" variant="outline" disabled={props.failureAction.disabled} onClick={props.failureAction.onClick}>
                        {props.failureAction.label}
                      </Button>
                    ) : null}
                  </div>
                ) : undefined}
              />
            ) : null}

            {props.isAutoDirectorTask ? <DirectorRuntimeProjectionCard projection={props.runtimeProjection} /> : null}

            {props.isAutoDirectorTask ? (
              <details className="group rounded-xl border border-border/60 bg-muted/10">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium marker:hidden">
                  <span>高级详情</span>
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">展开</span>
                  <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">收起</span>
                </summary>
                <div className="space-y-3 border-t border-border/50 px-3 py-3">
                  {task.checkpointSummary ? <WorkspaceStateNotice compact title="最近检查点" description={task.checkpointSummary} /> : null}
                  {task.lastError ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] px-3 py-3">
                      <div className="text-xs font-medium text-destructive">技术日志（高级）</div>
                      <CollapsibleText
                        className="mt-1 text-xs text-destructive/85"
                        text={task.lastError}
                        collapsedLines={3}
                        characterThreshold={240}
                        expandLabel="展开完整技术日志"
                        collapseLabel="收起技术日志"
                      />
                    </div>
                  ) : null}
                  {actionRows}
                </div>
              </details>
            ) : actionRows}

            <details className="group border-t border-border/35 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium marker:hidden">
                <span>执行步骤 {props.steps.length > 0 ? `(${props.steps.length})` : ""}</span>
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">展开</span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">收起</span>
              </summary>
              <div className="mt-3 space-y-2">
                {props.steps.length === 0 ? (
                  <WorkspaceStateNotice compact title="暂无步骤状态" description="该任务尚未提供可展示的细分步骤。" />
                ) : props.steps.map((step) => (
                  <div key={step.key} className="flex items-center justify-between rounded-xl bg-muted/25 px-3 py-2">
                    <div>{step.label}</div>
                    <TaskQueueStatusBadge
                      label={step.status === "succeeded" ? "已完成" : step.status === "failed" ? "失败" : step.status === "running" ? "进行中" : step.status === "cancelled" ? "已取消" : "未开始"}
                      tone={step.status === "succeeded" ? "success" : step.status === "failed" ? "danger" : step.status === "running" ? "info" : "neutral"}
                      className="border-0 bg-background/70 font-normal"
                    />
                  </div>
                ))}
              </div>
            </details>

            {task.kind === "novel_workflow" ? <TaskCenterMilestoneHistory milestones={props.milestones} /> : null}
          </>
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
