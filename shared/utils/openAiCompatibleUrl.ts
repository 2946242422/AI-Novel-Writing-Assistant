const DEFAULT_OPENAI_API_PATH = "/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeOpenAICompatibleBaseURL(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = parseHttpUrl(trimmed);
  if (!parsed) {
    return trimmed;
  }

  const pathname = parsed.pathname.replace(/\/+$/u, "");
  parsed.pathname = pathname || DEFAULT_OPENAI_API_PATH;
  return parsed.toString().replace(/\/$/u, "");
}

export function buildOpenAIChatCompletionsPreview(value: string): string {
  const normalized = normalizeOpenAICompatibleBaseURL(value);
  const parsed = parseHttpUrl(normalized);
  if (!parsed) {
    return "";
  }

  parsed.pathname = `${parsed.pathname.replace(/\/+$/u, "")}${CHAT_COMPLETIONS_PATH}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
