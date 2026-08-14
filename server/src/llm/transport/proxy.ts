import { ProxyAgent, type Dispatcher } from "undici";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export const DEFAULT_GEMINI_PROXY_URL = "http://127.0.0.1:7897";

const GEMINI_HOST_PATTERN = /(?:^|\.)generativelanguage\.googleapis\.com$/i;
const proxyDispatchers = new Map<string, Dispatcher>();

function normalizeProxyUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.toString().replace(/\/$/u, "");
}

function extractHost(baseURL: string | undefined): string {
  if (!baseURL) {
    return "";
  }
  try {
    return new URL(baseURL).hostname;
  } catch {
    return "";
  }
}

function isGeminiTransport(provider: LLMProvider, baseURL?: string): boolean {
  return provider === "gemini" || GEMINI_HOST_PATTERN.test(extractHost(baseURL));
}

function resolveConfiguredProxyUrl(input: {
  geminiTransport: boolean;
}): string | null {
  const candidates = [
    ...(input.geminiTransport ? [process.env.GEMINI_PROXY_URL] : []),
    process.env.AI_NOVEL_PROXY_URL,
    process.env.HTTPS_PROXY,
    process.env.ALL_PROXY,
    process.env.HTTP_PROXY,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeProxyUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function resolveLlmProxyUrl(input: {
  provider: LLMProvider;
  baseURL?: string;
}): string | null {
  const geminiTransport = isGeminiTransport(input.provider, input.baseURL);
  const configured = resolveConfiguredProxyUrl({
    geminiTransport,
  });
  if (configured) {
    return configured;
  }
  return geminiTransport
    ? DEFAULT_GEMINI_PROXY_URL
    : null;
}

export function resolveLlmProxyDispatcher(input: {
  provider: LLMProvider;
  baseURL?: string;
}): Dispatcher | undefined {
  const proxyURL = resolveLlmProxyUrl(input);
  if (!proxyURL) {
    return undefined;
  }

  const existing = proxyDispatchers.get(proxyURL);
  if (existing) {
    return existing;
  }

  const dispatcher = new ProxyAgent(proxyURL);
  proxyDispatchers.set(proxyURL, dispatcher);
  return dispatcher;
}
