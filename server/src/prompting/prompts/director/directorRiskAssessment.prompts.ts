import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  aiDirectorRiskAssessmentSchema,
  type AiDirectorRiskAssessment,
} from "@ai-novel/shared/types/directorRisk";
import type { PromptAsset } from "../../core/promptTypes";

export interface DirectorRiskAssessmentPromptInput {
  failureStage: string;
  failureType: string;
  failureSummary: string;
  failureDetailsJson: string;
  taskContextJson: string;
  auditReportsJson: string;
  replanDecisionJson: string;
  existingQualityDebtJson: string;
}

export const directorRiskAssessmentPrompt: PromptAsset<
  DirectorRiskAssessmentPromptInput,
  AiDirectorRiskAssessment
> = {
  id: "director.risk.assessment",
  version: "v2",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1_800 },
  outputSchema: aiDirectorRiskAssessmentSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是长篇小说自动导演的风险评估器。",
      "根据结构化事实评估 1-8 分风险、影响范围和建议动作，只输出严格 JSON。",
      "普通章节质量债、局部义务缺口和可恢复修复失败的 canPause 必须为 false，应优先继续或记录质量债。",
      "小范围可修问题建议 local_repair；审校已通过或只有表达模式告警的疑似误判建议 record_quality_debt。",
      "章节目标与相邻计划窗口明确失配、且已有可用正文时建议 replan，交由运行时自动重规划相邻章节，不需要用户先确认。",
      "只有没有可用正文、严重事实冲突、可能覆盖受保护正文、运行/数据完整性风险或同类自动处理连续失败时才可建议 pause/stop。",
      "不要因风险分数本身扩大影响范围，也不要发明输入中不存在的事实。",
    ].join("\n")),
    new HumanMessage([
      `失败阶段：${input.failureStage}`,
      `失败类型：${input.failureType}`,
      `摘要：${input.failureSummary}`,
      `失败详情：${input.failureDetailsJson || "{}"}`,
      `任务上下文：${input.taskContextJson || "{}"}`,
      `审校报告：${input.auditReportsJson || "[]"}`,
      `重规划结论：${input.replanDecisionJson || "null"}`,
      `已有质量债：${input.existingQualityDebtJson || "[]"}`,
    ].join("\n")),
  ],
};
