import type { ReviewIssue } from "@ai-novel/shared/types/novel";

function longestRun<T>(values: T[], predicate: (value: T) => boolean): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function isDialogueOnly(paragraph: string): boolean {
  const value = paragraph.trim();
  return (value.startsWith("“") && value.endsWith("”"))
    || (value.startsWith("「") && value.endsWith("」"))
    || (value.startsWith("『") && value.endsWith("』"));
}

function advisory(category: ReviewIssue["category"], evidence: string, fixSuggestion: string): ReviewIssue {
  return {
    severity: "low",
    category,
    evidence,
    fixSuggestion,
  };
}

export function detectLocalReadabilityAdvisories(content: string): ReviewIssue[] {
  const paragraphs = content
    .split(/\r?\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const issues: ReviewIssue[] = [];
  const shortRun = longestRun(paragraphs, (paragraph) => paragraph.length <= 22);
  if (shortRun >= 8) {
    issues.push(advisory(
      "pacing",
      `连续 ${shortRun} 个超短段落，手机端阅读可能呈现机械碎片感。`,
      "只合并属于同一动作、感受或交流回合的短段，保留真正需要停顿的句子。",
    ));
  }

  const wallCount = paragraphs.filter((paragraph) => paragraph.length > 520).length;
  if (wallCount > 0) {
    issues.push(advisory(
      "pacing",
      `发现 ${wallCount} 个超过 520 字的密集段落。`,
      "只在动作转向、说话者变化或认知转折处自然分段，不要切成句句独占一行。",
    ));
  }

  const dialogueRun = longestRun(paragraphs, isDialogueOnly);
  if (dialogueRun >= 6) {
    issues.push(advisory(
      "voice",
      `连续 ${dialogueRun} 段只有对白，读者可能需要回看说话者。`,
      "仅在可能混淆处补入动作、称呼或关系压力，不要每句都机械标注姓名。",
    ));
  }

  const openingCounts = new Map<string, number>();
  for (const paragraph of paragraphs.filter((item) => item.length >= 12)) {
    const prefix = [...paragraph].slice(0, 4).join("");
    openingCounts.set(prefix, (openingCounts.get(prefix) ?? 0) + 1);
  }
  const repeatedOpeningCount = Math.max(0, ...openingCounts.values());
  if (repeatedOpeningCount >= 4) {
    issues.push(advisory(
      "repetition",
      `至少 ${repeatedOpeningCount} 个段落使用相同句首结构。`,
      "调整信息出现顺序，让动作、感官、判断和对话根据场景自然轮换。",
    ));
  }
  return issues;
}
