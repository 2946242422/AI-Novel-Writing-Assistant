const DEFAULT_COLLAPSE_THRESHOLD = 320;
const DEFAULT_COLLAPSE_LINE_THRESHOLD = 6;

export function shouldCollapseText(
  text: string,
  characterThreshold = DEFAULT_COLLAPSE_THRESHOLD,
  lineThreshold = DEFAULT_COLLAPSE_LINE_THRESHOLD,
): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return normalized.length > characterThreshold
    || normalized.split(/\r?\n/).length > lineThreshold;
}
