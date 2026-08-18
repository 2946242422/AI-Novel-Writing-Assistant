import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { resolveModelAttentionIssue } from "@ai-novel/shared/types/modelAttention";
import { Button } from "@/components/ui/button";
import { CollapsibleText } from "@/components/common/CollapsibleText";
import {
  TaskQueueActionRow,
  TaskQueueImpactNotice,
  TaskQueueSection,
  TaskQueueStatusBadge,
} from "@/components/taskQueue";
import { WorkspaceStateNotice } from "@/components/workspace";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import {
  getFollowUpActionConsequence,
  getFollowUpActionRiskDescription,
  getFollowUpActionTone,
  getFollowUpLevelLabel,
  getFollowUpPriorityLabel,
  getFollowUpSeverity,
  getFollowUpTone,
} from "../followUpPresentation";

interface AutoDirectorFollowUpDetailPanelProps {
  detail: AutoDirectorFollowUpDetail | null;
  selectedItem: AutoDirectorFollowUpItem | null;
  loading: boolean;
  errorMessage?: string | null;
  actionLoading: boolean;
  onExecuteAction: (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => void | Promise<void>;
  onRetry: () => void | Promise<void>;
}

function FollowUpDetailText(props: {
  label: string;
  text: string;
  collapsedLines?: 3 | 4 | 5 | 6;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs font-medium text-foreground">{props.label}</div>
      <CollapsibleText
        text={props.text}
        collapsedLines={props.collapsedLines ?? 4}
        expandLabel={`展开完整${props.label}`}
        collapseLabel={`收起${props.label}`}
      />
    </div>
  );
}

export function AutoDirectorFollowUpDetailPanel({
  detail,
  selectedItem,
  loading,
  errorMessage,
  actionLoading,
  onExecuteAction,
  onRetry,
}: AutoDirectorFollowUpDetailPanelProps) {
  const deliveryStatusLabels = {
    delivered: "已送达",
    pending: "投递中",
    failed: "投递失败",
  } as const;
  const eventTypeLabels = {
    "auto_director.approval_required": "需要处理",
    "auto_director.auto_approved": "AI 已自动通过",
    "auto_director.exception": "任务异常",
    "auto_director.recovered": "已恢复",
    "auto_director.completed": "已完成",
    "auto_director.progress_changed": "进度变化",
  } as const;
  const tone = selectedItem ? getFollowUpTone(selectedItem) : "neutral";
  const modelAttention = detail ? resolveModelAttentionIssue(detail.task) : null;
  const automaticAction = detail?.availableActions.find((action) => action.code === "auto_resolve_and_continue") ?? null;
  const primaryActions = modelAttention
    ? []
    : automaticAction
      ? [automaticAction]
      : detail?.availableActions.slice(0, 1) ?? [];
  const advancedActions = detail?.availableActions.filter((action) => (
    !primaryActions.includes(action) && action.kind === "navigation"
  )) ?? [];

  return (
    <TaskQueueSection
      title="跟进详情"
      description="每个动作都会说明后果；跟进项会保持对应的导演任务身份，不与手动工作区任务混用。"
      className="min-w-0 overflow-hidden"
    >
      <div className="space-y-4">
        {loading ? (
          <WorkspaceStateNotice loading title="正在读取跟进详情" description="正在同步导演任务、检查点和最近校验结果。" />
        ) : null}

        {errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title="跟进详情读取失败"
            description={errorMessage}
            action={<Button size="sm" variant="outline" onClick={() => void onRetry()}>重新读取</Button>}
          />
        ) : null}

        {!loading && !errorMessage && (!detail || !selectedItem) ? (
          <WorkspaceStateNotice title="请选择一个导演跟进项" description="选择后可查看阻塞范围、下一步和安全动作。" />
        ) : null}

        {detail && selectedItem ? (
          <>
            <div className="space-y-1">
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} font-medium`}>{selectedItem.novelTitle}</div>
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm text-muted-foreground`}>{selectedItem.reasonLabel}</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <TaskQueueStatusBadge label={getFollowUpLevelLabel(selectedItem)} tone={tone} />
                <TaskQueueStatusBadge label={getFollowUpPriorityLabel(selectedItem.priority, selectedItem.reason)} tone={tone} />
              </div>
            </div>

            <TaskQueueImpactNotice
              severity={getFollowUpSeverity(selectedItem)}
              title={modelAttention?.title ?? (automaticAction ? "AI 可自动处理" : getFollowUpLevelLabel(selectedItem))}
              description={modelAttention?.message ?? (automaticAction
                ? "AI 会自动判断修复、重规划、恢复或重试，并在处理后继续创作。"
                : detail.blockingReason ?? detail.followUpSummary)}
            />

            {primaryActions.length > 0 ? <div className="space-y-2">
              <div className="text-sm font-medium">推荐动作</div>
              {primaryActions.map((action) => (
                <TaskQueueActionRow
                  key={action.code}
                  title={action.label}
                  consequence={`${getFollowUpActionConsequence(action)} 风险：${getFollowUpActionRiskDescription(action)}`}
                  tone={getFollowUpActionTone(action)}
                  action={(
                    <Button
                      variant={action.kind === "mutation" && action.riskLevel === "low" ? "default" : "outline"}
                      size="sm"
                      className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                      disabled={actionLoading}
                      onClick={() => void onExecuteAction(selectedItem, action)}
                    >
                      {action.label}
                    </Button>
                  )}
                />
              ))}
            </div> : null}

            <details className="group rounded-md border border-border/80 bg-muted/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div>
                  <div className="text-sm font-medium text-foreground">高级详情</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    查看检查点、审校原因、模型、里程碑和通道记录。
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-4 border-t border-border/70 px-3 py-3">

            {advancedActions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">相关页面</div>
                {advancedActions.map((action) => (
                  <TaskQueueActionRow
                    key={action.code}
                    title={action.label}
                    consequence={getFollowUpActionConsequence(action)}
                    tone={getFollowUpActionTone(action)}
                    action={(
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => void onExecuteAction(selectedItem, action)}
                      >
                        {action.label}
                      </Button>
                    )}
                  />
                ))}
              </div>
            ) : null}

            {detail.task.lastError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] p-3">
                <FollowUpDetailText label="技术日志（高级）" text={detail.task.lastError} collapsedLines={3} />
              </div>
            ) : null}

            {detail.riskNote ? (
              <WorkspaceStateNotice
                compact
                tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "info"}
                title="风险说明"
                description={detail.riskNote}
              />
            ) : null}

            <div className={`grid gap-2 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              <FollowUpDetailText label="下一步建议" text={detail.nextStepSuggestion ?? "查看任务详情后再继续。"} />
              <FollowUpDetailText label="检查点摘要" text={detail.checkpointSummary ?? "暂无"} />
              <div>当前模型：{detail.currentModel ?? "暂无"}</div>
            </div>

            {selectedItem.section === "needs_validation" ? (
              <div className={`space-y-3 rounded-md border border-warning/25 bg-warning/5 p-3 text-sm text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-medium">先校验任务和资产状态</div>
                    <div className="mt-1 text-xs">
                      安全修复只处理状态对账，不会清除正文、重写规划、确认候选、切换模型或替你做创作选择。
                    </div>
                  </div>
                </div>
                {(detail.validationSummary?.blockingReasons.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.blockingReasons.map((reason) => (
                      <CollapsibleText
                        key={reason}
                        text={`阻塞：${reason}`}
                        collapsedLines={3}
                        characterThreshold={200}
                        expandLabel="展开完整阻塞原因"
                        collapseLabel="收起阻塞原因"
                      />
                    ))}
                  </div>
                ) : null}
                {(detail.validationSummary?.warnings.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.warnings.map((warning) => (
                      <CollapsibleText
                        key={warning}
                        text={`提示：${warning}`}
                        collapsedLines={3}
                        characterThreshold={200}
                        expandLabel="展开完整提示"
                        collapseLabel="收起提示"
                      />
                    ))}
                  </div>
                ) : null}
                <div className="text-xs leading-5 text-muted-foreground">
                  低风险校验问题会由“AI 自动处理并继续”完成对账和恢复；涉及正文丢失或受保护内容时才会暂停。
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">最近里程碑</div>
              <div className="space-y-2">
                {detail.milestones.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无里程碑</div>
                ) : detail.milestones.map((milestone) => (
                  <div key={`${milestone.at}:${milestone.label}`} className={`rounded-md border p-3 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="font-medium">{milestone.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(milestone.at).toLocaleString()}</div>
                    {milestone.summary ? (
                      <CollapsibleText
                        className="mt-1 text-xs text-muted-foreground"
                        text={milestone.summary}
                        collapsedLines={3}
                        characterThreshold={240}
                        expandLabel="展开完整里程碑日志"
                        collapseLabel="收起里程碑日志"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">通道触达</div>
              <div className="space-y-2">
                {(detail.channelDeliveries?.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无通道投递记录</div>
                ) : detail.channelDeliveries?.map((delivery) => (
                  <div key={`${delivery.channelType}:${delivery.eventType}`} className={`rounded-md border p-3 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskQueueStatusBadge label={delivery.channelType === "dingtalk" ? "钉钉" : "企微"} tone="neutral" />
                      <TaskQueueStatusBadge
                        label={deliveryStatusLabels[delivery.status]}
                        tone={delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "danger" : "info"}
                      />
                      <span className="text-xs text-muted-foreground">{eventTypeLabels[delivery.eventType]}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      目标：{delivery.target ?? "未记录"} | 响应码：{delivery.responseStatus ?? "未记录"} | 时间：{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : "未送达"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
