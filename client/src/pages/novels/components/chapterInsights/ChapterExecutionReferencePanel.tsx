import type {
  AuditReport,
  Chapter,
  ReplanRecommendation,
  ReplanResult,
  StoryPlan,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import { formatChapterCraftTechniqueLabel } from "@ai-novel/shared/types/novel/chapterCraft";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StreamOutput from "@/components/common/StreamOutput";
import {
  ChapterRuntimeAuditCard,
  ChapterRuntimeContextCard,
  ChapterRuntimeLengthCard,
} from "../ChapterRuntimePanels";
import {
  hasText,
  parseChapterScenePlanForDisplay,
  type AssetTabKey,
  MetricBadge,
} from "../chapterExecution.shared";

interface ChapterExecutionReferencePanelProps {
  selectedChapter?: Chapter;
  assetTab: AssetTabKey;
  onAssetTabChange: (tab: AssetTabKey) => void;
  chapterPlan?: StoryPlan | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterAuditReports: AuditReport[];
  replanRecommendation?: ReplanRecommendation | null;
  onReplanChapter: () => void;
  isReplanningChapter: boolean;
  lastReplanResult?: ReplanResult | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  };
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  reviewResult: {
    issues?: Array<{ category: string; fixSuggestion: string }>;
  } | null;
  openAuditIssues: Array<{ id: string; auditType: string; fixSuggestion: string }>;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  repairStreamingChapterId?: string | null;
  repairStreamingChapterLabel?: string | null;
  repairRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  onAbortRepair: () => void;
}

function PanelHintCard(props: { title: string; content: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 p-3">
      <div className="text-xs text-muted-foreground">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-foreground">{props.content}</div>
    </div>
  );
}

function ReferenceNotice(props: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-900">
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 leading-6 text-amber-800">{props.description}</div>
    </div>
  );
}

export default function ChapterExecutionReferencePanel(props: ChapterExecutionReferencePanelProps) {
  const {
    selectedChapter,
    assetTab,
    onAssetTabChange,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    replanRecommendation,
    onReplanChapter,
    isReplanningChapter,
    lastReplanResult,
    chapterQualityReport,
    chapterRuntimePackage,
    reviewResult,
    openAuditIssues,
    repairStreamContent,
    isRepairStreaming,
    repairStreamingChapterId,
    repairStreamingChapterLabel,
    repairRunStatus,
    onAbortRepair,
  } = props;

  if (!selectedChapter) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background p-4 text-sm leading-6 text-muted-foreground">
        选中章节后，这里会显示任务单、场景拆解、质量反馈、修复记录和诊断信息。
      </div>
    );
  }

  const runtimePackage = chapterRuntimePackage?.chapterId === selectedChapter.id ? chapterRuntimePackage : null;
  const chapterObjective = chapterPlan?.objective ?? selectedChapter.expectation ?? "这一章还没有明确目标，建议先补章节计划。";
  const scenePlan = parseChapterScenePlanForDisplay(selectedChapter);
  const isSelectedChapterRepairStreaming = isRepairStreaming && repairStreamingChapterId === selectedChapter.id;
  const isSelectedChapterRepairFinalizing = isSelectedChapterRepairStreaming && repairRunStatus?.phase === "finalizing";
  const visibleRepairStreamContent = repairStreamingChapterId === selectedChapter.id ? repairStreamContent : "";
  const hasVisibleRepairOutput = hasText(visibleRepairStreamContent);
  const repairingOtherChapter = isRepairStreaming && repairStreamingChapterId && repairStreamingChapterId !== selectedChapter.id;
  const detailTab = assetTab === "content" ? "taskSheet" : assetTab;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-foreground">资料诊断</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              查看本章任务、质量和修复依据，不占用正文阅读区。
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">第{selectedChapter.order}章</Badge>
        </div>
      </div>

      <Tabs value={detailTab} onValueChange={(value) => onAssetTabChange(value as AssetTabKey)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1.5">
          <TabsTrigger value="taskSheet" className="rounded-xl text-xs">任务单</TabsTrigger>
          <TabsTrigger value="sceneCards" className="rounded-xl text-xs">场景</TabsTrigger>
          <TabsTrigger value="quality" className="rounded-xl text-xs">质量</TabsTrigger>
          <TabsTrigger value="repair" className="rounded-xl text-xs">修复</TabsTrigger>
          <TabsTrigger value="content" className="col-span-2 rounded-xl text-xs">上下文诊断</TabsTrigger>
        </TabsList>

        <TabsContent value="taskSheet" className="space-y-3">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">本章任务单</div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {selectedChapter.taskSheet?.trim() || "暂无任务单。你可以先让 AI 生成任务单，再回来继续写这章。"}
            </div>
          </div>
          <PanelHintCard title="章节目标" content={chapterObjective} />
          <PanelHintCard title="最新状态" content={latestStateSnapshot?.summary || "暂无状态摘要。"} />
          <ChapterRuntimeContextCard
            runtimePackage={runtimePackage}
            chapterPlan={chapterPlan}
            stateSnapshot={latestStateSnapshot}
          />
        </TabsContent>

        <TabsContent value="sceneCards" className="space-y-3">
          <ChapterRuntimeLengthCard runtimePackage={runtimePackage} />
          {scenePlan ? (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">场景预算合同</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MetricBadge label="章节目标" value={`${scenePlan.targetWordCount} 字`} />
                  <MetricBadge label="场景数" value={String(scenePlan.scenes.length)} />
                </div>
              </div>
              <div className="rounded-2xl border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">AI 自动写法方案</div>
                  <Badge variant="secondary">
                    {scenePlan.craftPlan.mode === "none"
                      ? "自然执行"
                      : scenePlan.craftPlan.mode === "focused"
                        ? "单项聚焦"
                        : "组合写法"}
                  </Badge>
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {scenePlan.craftPlan.chapterApproach}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <PanelHintCard title="选择依据" content={scenePlan.craftPlan.selectionRationale} />
                  <PanelHintCard title="节奏策略" content={scenePlan.craftPlan.pacingStrategy} />
                  <PanelHintCard title="结尾策略" content={scenePlan.craftPlan.endingStrategy} />
                  <PanelHintCard
                    title="重点避免"
                    content={scenePlan.craftPlan.avoid.join("；") || "无额外限制。"}
                  />
                </div>
                {scenePlan.craftPlan.selectedTechniques.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {scenePlan.craftPlan.selectedTechniques.map((technique) => (
                      <div
                        key={`${technique.type}-${technique.sceneKeys.join("-")}`}
                        className="rounded-xl border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatChapterCraftTechniqueLabel(technique.type)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            场景：{technique.sceneKeys.join("、")} · 强度：{technique.intensity}
                          </span>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-foreground">{technique.purpose}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{technique.guidance}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs leading-5 text-muted-foreground">
                    本章不强制加入专门技法，正文按任务与场景变化自然推进。
                  </div>
                )}
              </div>
              {scenePlan.scenes.map((scene, index) => (
                <div key={scene.key} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">场景 {index + 1}</Badge>
                    <Badge variant="secondary">{scene.targetWordCount} 字</Badge>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">{scene.title}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{scene.purpose}</div>
                  <div className="mt-3 space-y-2">
                    <PanelHintCard title="必须推进" content={scene.mustAdvance.join("；") || "无"} />
                    <PanelHintCard title="必须保留" content={scene.mustPreserve.join("；") || "无"} />
                    <PanelHintCard title="起始状态" content={scene.entryState} />
                    <PanelHintCard title="结束状态" content={scene.exitState} />
                  </div>
                  {scene.forbiddenExpansion.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900">
                      禁止展开：{scene.forbiddenExpansion.join("；")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground">场景拆解</div>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {selectedChapter.sceneCards?.trim()
                  ? "当前是旧版场景拆解文本，建议重新生成章节执行合同。"
                  : "暂无场景拆解。"}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="quality" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricBadge label="总体" value={String(chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? "-")} />
            <MetricBadge label="连贯性" value={String(chapterQualityReport?.coherence ?? "-")} />
            <MetricBadge label="重复度" value={String(chapterQualityReport?.repetition ?? "-")} />
            <MetricBadge label="节奏" value={String(chapterQualityReport?.pacing ?? selectedChapter.pacingScore ?? "-")} />
            <MetricBadge label="文风" value={String(chapterQualityReport?.voice ?? "-")} />
            <MetricBadge label="吸引力" value={String(chapterQualityReport?.engagement ?? "-")} />
          </div>

          <div className="rounded-2xl border p-4 text-sm">
            <div className="font-semibold text-foreground">最近审校问题</div>
            {reviewResult?.issues?.length ? (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {reviewResult.issues.slice(0, 5).map((item, index) => (
                  <div key={`${item.category}-${index}`} className="rounded-xl border p-3">
                    <div className="font-medium text-foreground">{item.category}</div>
                    <div className="mt-1 leading-6">{item.fixSuggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-6 text-muted-foreground">当前没有最近审校问题。</div>
            )}
          </div>

          <div className="rounded-2xl border p-4 text-sm">
            <div className="font-semibold text-foreground">结构化审计问题</div>
            {openAuditIssues.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {openAuditIssues.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-xl border p-3">
                    <div className="font-medium text-foreground">{item.auditType}</div>
                    <div className="mt-1 leading-6">{item.fixSuggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-6 text-muted-foreground">当前没有结构化审计问题。</div>
            )}
          </div>

          <ChapterRuntimeAuditCard
            runtimePackage={runtimePackage}
            auditReports={chapterAuditReports}
            replanRecommendation={replanRecommendation}
            onReplan={onReplanChapter}
            isReplanning={isReplanningChapter}
            lastReplanResult={lastReplanResult}
          />
        </TabsContent>

        <TabsContent value="repair" className="space-y-3">
          {repairingOtherChapter ? (
            <ReferenceNotice
              title="还有其他章节正在后台修复"
              description={`${repairStreamingChapterLabel ?? "另一章"} 仍在修复中。当前章节不会显示那一章的修复流，返回对应章节即可继续查看。`}
            />
          ) : null}

          {(isSelectedChapterRepairStreaming || hasVisibleRepairOutput) ? (
            <StreamOutput
              title="问题修复输出"
              emptyText={isSelectedChapterRepairFinalizing
                ? (repairRunStatus?.message ?? "修复文本已经输出完成，系统正在保存并复审。")
                : "等待修复输出..."}
              content={visibleRepairStreamContent}
              isStreaming={isSelectedChapterRepairStreaming}
              onAbort={isSelectedChapterRepairFinalizing ? undefined : onAbortRepair}
            />
          ) : null}

          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">修复记录</div>
            <div className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-7">
              {selectedChapter.repairHistory?.trim() || "暂无修复记录。"}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-3">
          <ChapterRuntimeContextCard
            runtimePackage={null}
            chapterPlan={chapterPlan}
            stateSnapshot={latestStateSnapshot}
          />
          <ChapterRuntimeAuditCard
            runtimePackage={null}
            auditReports={chapterAuditReports}
            replanRecommendation={replanRecommendation}
            onReplan={onReplanChapter}
            isReplanning={isReplanningChapter}
            lastReplanResult={lastReplanResult}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
