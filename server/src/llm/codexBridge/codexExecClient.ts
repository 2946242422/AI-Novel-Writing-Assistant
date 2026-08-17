import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface CodexExecUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface CodexExecRequest {
  prompt: string;
  outputSchema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CodexExecResult {
  text: string;
  usage: CodexExecUsage | null;
}

interface CodexLaunchSpec {
  command: string;
  argsPrefix: string[];
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_STDIO_CHARS = 24_000;
const MAX_PROMPT_CHARS = 1_500_000;

let launchSpecCache: CodexLaunchSpec | null = null;
let queueTail: Promise<void> = Promise.resolve();

function normalizePositiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function appendCapped(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length > MAX_STDIO_CHARS ? next.slice(-MAX_STDIO_CHARS) : next;
}

function resolveConfiguredLaunchSpec(value: string): CodexLaunchSpec | null {
  const configured = value.trim();
  if (!configured) {
    return null;
  }
  if (configured.toLowerCase().endsWith(".js")) {
    return { command: process.execPath, argsPrefix: [configured] };
  }
  return { command: configured, argsPrefix: [] };
}

function candidateCodexJsPaths(): string[] {
  const roots = [
    process.env.NVM_SYMLINK,
    path.dirname(process.execPath),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : undefined,
    process.platform === "win32" ? "C:\\nvm4w\\nodejs" : undefined,
  ].filter((item): item is string => Boolean(item));

  if (process.platform === "win32") {
    const whereResult = spawnSync("where.exe", ["codex.cmd"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (whereResult.status === 0) {
      for (const entry of whereResult.stdout.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)) {
        roots.push(path.dirname(entry));
      }
    }
  }

  return Array.from(new Set(roots)).map((root) => (
    path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js")
  ));
}

export function resolveCodexLaunchSpec(): CodexLaunchSpec {
  if (launchSpecCache) {
    return launchSpecCache;
  }

  const configured = resolveConfiguredLaunchSpec(process.env.CODEX_BRIDGE_CLI_PATH ?? "");
  if (configured) {
    launchSpecCache = configured;
    return configured;
  }

  for (const candidate of candidateCodexJsPaths()) {
    if (existsSync(candidate)) {
      launchSpecCache = { command: process.execPath, argsPrefix: [candidate] };
      return launchSpecCache;
    }
  }

  launchSpecCache = {
    command: process.platform === "win32" ? "codex.exe" : "codex",
    argsPrefix: [],
  };
  return launchSpecCache;
}

function buildCodexEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  env.NO_COLOR = "1";
  return env;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractUsage(stdout: string): CodexExecUsage | null {
  let usage: CodexExecUsage | null = null;
  for (const line of stdout.split(/\r?\n/u)) {
    const event = parseJsonLine(line) as {
      type?: unknown;
      usage?: {
        input_tokens?: unknown;
        cached_input_tokens?: unknown;
        output_tokens?: unknown;
        reasoning_output_tokens?: unknown;
      };
    } | null;
    if (event?.type !== "turn.completed" || !event.usage) {
      continue;
    }
    usage = {
      inputTokens: normalizePositiveInteger(event.usage.input_tokens),
      cachedInputTokens: normalizePositiveInteger(event.usage.cached_input_tokens),
      outputTokens: normalizePositiveInteger(event.usage.output_tokens),
      reasoningOutputTokens: normalizePositiveInteger(event.usage.reasoning_output_tokens),
    };
  }
  return usage;
}

function extractEventError(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    const event = parseJsonLine(line) as {
      type?: unknown;
      message?: unknown;
      error?: { message?: unknown };
    } | null;
    if (event?.type === "error") {
      const message = event.error?.message ?? event.message;
      return typeof message === "string" && message.trim() ? message.trim() : "Codex 执行失败。";
    }
  }
  return null;
}

function sanitizeFailureDetail(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("user") && !item.startsWith("-----"));
  return lines.slice(-8).join(" ").slice(0, 2000);
}

async function runCodexExecOnce(input: CodexExecRequest): Promise<CodexExecResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("本地 Codex 没有收到可执行的提示词。");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`本地 Codex 提示词过长（${prompt.length} 字符）。`);
  }
  if (input.signal?.aborted) {
    throw new Error("本地 Codex 请求已取消。");
  }

  const workdir = await mkdtemp(path.join(tmpdir(), "ai-novel-codex-"));
  const outputPath = path.join(workdir, "last-message.txt");
  const schemaPath = path.join(workdir, "output-schema.json");
  try {
    if (input.outputSchema) {
      await writeFile(schemaPath, JSON.stringify(input.outputSchema), "utf8");
    }

    const launch = resolveCodexLaunchSpec();
    const codexModel = input.model?.trim() || process.env.CODEX_BRIDGE_MODEL?.trim();
    const args = [
      ...launch.argsPrefix,
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ignore-rules",
      "--ignore-user-config",
      "--color",
      "never",
      "--json",
      "-C",
      workdir,
      "-o",
      outputPath,
      ...(input.outputSchema ? ["--output-schema", schemaPath] : []),
      ...(codexModel && codexModel !== "local-chatgpt" ? ["--model", codexModel] : []),
      "-",
    ];

    const timeoutMs = input.timeoutMs && input.timeoutMs > 0
      ? Math.floor(input.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    const child = spawn(launch.command, args, {
      cwd: workdir,
      env: buildCodexEnvironment(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCapped(stderr, chunk);
    });
    child.stdin.on("error", () => undefined);

    const completion = new Promise<number>((resolve, reject) => {
      child.once("error", (error: NodeJS.ErrnoException) => {
        reject(error.code === "ENOENT"
          ? new Error("没有找到本机 Codex CLI。请先安装并登录 Codex。")
          : error);
      });
      child.once("close", (code) => resolve(code ?? 1));
    });
    let timedOut = false;
    const abort = () => child.kill();
    input.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);

    child.stdin.end(prompt, "utf8");
    let exitCode: number;
    try {
      exitCode = await completion;
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
    }

    if (input.signal?.aborted) {
      throw new Error("本地 Codex 请求已取消。");
    }
    if (timedOut) {
      throw new Error(`本地 Codex 请求超时（${timeoutMs}ms）。`);
    }
    if (exitCode !== 0) {
      const detail = extractEventError(stdout) ?? sanitizeFailureDetail(stderr);
      throw new Error(detail || `本地 Codex 进程退出，代码 ${exitCode}。`);
    }

    const text = (await readFile(outputPath, "utf8").catch(() => "")).trim();
    if (!text) {
      throw new Error("本地 Codex 没有返回可用内容。");
    }
    return {
      text,
      usage: extractUsage(stdout),
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function runCodexExec(input: CodexExecRequest): Promise<CodexExecResult> {
  const scheduled = queueTail.then(
    () => runCodexExecOnce(input),
    () => runCodexExecOnce(input),
  );
  queueTail = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}
