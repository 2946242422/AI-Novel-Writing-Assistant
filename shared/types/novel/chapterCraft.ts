import { z } from "zod";

export const CHAPTER_CRAFT_TECHNIQUE_TYPES = [
  "dialogue_subtext",
  "power_shift",
  "evidence_chain",
  "sensory_grounding",
  "action_rhythm",
  "psychological_externalization",
  "environmental_pressure",
  "information_gap",
  "misdirection_reveal",
  "emotional_escalation",
  "horror_restraint",
  "comedic_timing",
  "spatial_choreography",
  "concrete_hook",
  "motif_recurrence",
] as const;

export const chapterCraftTechniqueTypeSchema = z.enum(CHAPTER_CRAFT_TECHNIQUE_TYPES);
export const chapterCraftPlanModeSchema = z.enum(["none", "focused", "mixed"]);

export const chapterCraftTechniqueSchema = z.object({
  type: chapterCraftTechniqueTypeSchema,
  sceneKeys: z.array(z.string().trim().min(1)).min(1).max(3),
  purpose: z.string().trim().min(1),
  guidance: z.string().trim().min(1),
  intensity: z.enum(["low", "medium", "high"]).default("medium"),
});

export const generatedChapterCraftTechniqueSchema = chapterCraftTechniqueSchema.extend({
  intensity: z.enum(["low", "medium", "high"]),
});

export const chapterCraftPlanSchema = z.object({
  mode: chapterCraftPlanModeSchema,
  chapterApproach: z.string().trim().min(1),
  selectionRationale: z.string().trim().min(1),
  pacingStrategy: z.string().trim().min(1),
  endingStrategy: z.string().trim().min(1),
  selectedTechniques: z.array(chapterCraftTechniqueSchema).max(3).default([]),
  avoid: z.array(z.string().trim().min(1)).max(6).default([]),
});

export const generatedChapterCraftPlanSchema = chapterCraftPlanSchema.extend({
  selectedTechniques: z.array(generatedChapterCraftTechniqueSchema).max(3),
  avoid: z.array(z.string().trim().min(1)).max(6),
});

export type ChapterCraftTechniqueType = z.infer<typeof chapterCraftTechniqueTypeSchema>;
export type ChapterCraftTechnique = z.infer<typeof chapterCraftTechniqueSchema>;
export type ChapterCraftPlan = z.infer<typeof chapterCraftPlanSchema>;

export const EMPTY_CHAPTER_CRAFT_PLAN: ChapterCraftPlan = {
  mode: "none",
  chapterApproach: "服从章节任务与场景卡，不额外强制写作技法。",
  selectionRationale: "当前章节没有已保存的专门写法方案。",
  pacingStrategy: "按场景卡的阻力、转折与状态变化自然推进。",
  endingStrategy: "兑现读者体验合同中的章末钩子，不越过章节边界。",
  selectedTechniques: [],
  avoid: ["不要为了展示技巧而堆叠感官、比喻、通感或解释性对白。"],
};

const TECHNIQUE_LABELS: Record<ChapterCraftTechniqueType, string> = {
  dialogue_subtext: "潜台词对话",
  power_shift: "权力关系变化",
  evidence_chain: "证据链调查",
  sensory_grounding: "感官锚点",
  action_rhythm: "动作节奏",
  psychological_externalization: "心理外化",
  environmental_pressure: "环境施压",
  information_gap: "信息差悬念",
  misdirection_reveal: "误导与揭示",
  emotional_escalation: "情绪递进",
  horror_restraint: "恐怖留白",
  comedic_timing: "喜剧节奏",
  spatial_choreography: "空间调度",
  concrete_hook: "具体行动钩子",
  motif_recurrence: "意象回环",
};

export function formatChapterCraftTechniqueLabel(type: ChapterCraftTechniqueType): string {
  return TECHNIQUE_LABELS[type];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value.split(/[\n,，;；、|]/g).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCraftTechnique(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  return {
    type: raw.type ?? raw.technique ?? raw.kind,
    sceneKeys: normalizeStringArray(raw.sceneKeys ?? raw.scene_keys ?? raw.targetScenes ?? raw.targets),
    purpose: raw.purpose ?? raw.objective ?? raw.reason,
    guidance: raw.guidance ?? raw.instruction ?? raw.execution,
    intensity: raw.intensity ?? raw.strength ?? "medium",
  };
}

export function normalizeChapterCraftPlan(raw: unknown): ChapterCraftPlan {
  if (!isRecord(raw)) {
    return chapterCraftPlanSchema.parse(EMPTY_CHAPTER_CRAFT_PLAN);
  }
  const selectedTechniquesRaw = raw.selectedTechniques
    ?? raw.selected_techniques
    ?? raw.techniques
    ?? [];
  const normalized = {
    mode: raw.mode ?? raw.strategyMode ?? raw.strategy_mode ?? "none",
    chapterApproach: raw.chapterApproach ?? raw.chapter_approach ?? raw.approach,
    selectionRationale: raw.selectionRationale ?? raw.selection_rationale ?? raw.rationale,
    pacingStrategy: raw.pacingStrategy ?? raw.pacing_strategy ?? raw.pacing,
    endingStrategy: raw.endingStrategy ?? raw.ending_strategy ?? raw.ending,
    selectedTechniques: Array.isArray(selectedTechniquesRaw)
      ? selectedTechniquesRaw.map(normalizeCraftTechnique)
      : [],
    avoid: normalizeStringArray(raw.avoid ?? raw.avoidList ?? raw.avoid_list),
  };
  const parsed = chapterCraftPlanSchema.safeParse(normalized);
  return parsed.success ? parsed.data : chapterCraftPlanSchema.parse(EMPTY_CHAPTER_CRAFT_PLAN);
}
