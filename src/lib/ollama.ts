import "server-only";
import type { OllamaStatus } from "@/lib/types";

export const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const PREFERRED_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const FALLBACK_ORDER = ["llama3.2", "qwen3", "qwen2.5", "gemma3", "llama3.1", "mistral", "phi4", "phi3"];

const isChatModel = (name: string) => !/embed|bge|minilm|nomic/i.test(name);

const matches = (name: string, family: string) => name === family || name.startsWith(`${family}:`);

export function pickModel(models: string[], requested?: string): string | null {
  const chat = models.filter(isChatModel);
  if (requested && chat.includes(requested)) return requested;
  for (const family of [PREFERRED_MODEL, ...FALLBACK_ORDER]) {
    const hit = chat.find((m) => matches(m, family));
    if (hit) return hit;
  }
  return chat[0] ?? null;
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name).filter(isChatModel);
    return { running: true, host: OLLAMA_HOST, models, defaultModel: pickModel(models) };
  } catch {
    return { running: false, host: OLLAMA_HOST, models: [], defaultModel: null };
  }
}

interface ChatOptions {
  model: string;
  system: string;
  user: string;
  examples?: { role: "user" | "assistant"; content: string }[];
  schema: object;
  numCtx: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function ollamaChatJson<T>({
  model,
  system,
  user,
  examples = [],
  schema,
  numCtx,
  timeoutMs = 180_000,
  signal,
}: ChatOptions): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      keep_alive: "10m",
      // num_predict caps runaway generations; a digest never needs more than a few hundred tokens.
      options: { temperature: 0.2, num_ctx: numCtx, num_predict: 400 },
      messages: [
        { role: "system", content: system },
        ...examples,
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return JSON.parse(content) as T;
}
