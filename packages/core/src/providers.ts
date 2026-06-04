import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import type { LanguageModel } from "ai";
import { getApiKey, hasApiKey } from "./keys.js";
import type { ModelInfo, ProviderId, ProviderStatus } from "./types.js";

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";

/** Curated default models per provider. Users can also type any model id. */
const CATALOG: Record<ProviderId, { model: string; label: string }[]> = {
  anthropic: [
    { model: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { model: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    { model: "claude-3-opus-latest", label: "Claude 3 Opus" },
  ],
  openai: [
    { model: "gpt-4o", label: "GPT-4o" },
    { model: "gpt-4o-mini", label: "GPT-4o mini" },
    { model: "o3-mini", label: "o3-mini" },
  ],
  ollama: [
    { model: "llama3.1", label: "Llama 3.1 (local)" },
    { model: "qwen2.5", label: "Qwen 2.5 (local)" },
    { model: "mistral", label: "Mistral (local)" },
  ],
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  ollama: "Ollama (local)",
};

/** Parses a model id of the form "provider:model" (model may contain colons). */
export function parseModelId(id: string): { provider: ProviderId; model: string } {
  const idx = id.indexOf(":");
  if (idx === -1) {
    throw new Error(`Invalid model id "${id}". Expected "provider:model".`);
  }
  const provider = id.slice(0, idx) as ProviderId;
  const model = id.slice(idx + 1);
  if (!(provider in CATALOG)) {
    throw new Error(`Unknown provider "${provider}".`);
  }
  return { provider, model };
}

/** Returns a configured AI SDK language model for the given "provider:model" id. */
export function getLanguageModel(id: string): LanguageModel {
  const { provider, model } = parseModelId(id);
  switch (provider) {
    case "anthropic": {
      const apiKey = getApiKey("anthropic");
      if (!apiKey) throw new ProviderNotConfiguredError("anthropic");
      return createAnthropic({ apiKey })(model);
    }
    case "openai": {
      const apiKey = getApiKey("openai");
      if (!apiKey) throw new ProviderNotConfiguredError("openai");
      return createOpenAI({ apiKey })(model);
    }
    case "ollama": {
      return createOllama({ baseURL: `${OLLAMA_BASE_URL}/api` })(model);
    }
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(public provider: ProviderId) {
    super(`No API key configured for ${PROVIDER_LABELS[provider]}.`);
    this.name = "ProviderNotConfiguredError";
  }
}

async function isOllamaReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Lists installed Ollama models, or [] if the server is unreachable. */
async function listOllamaModels(): Promise<{ model: string; label: string }[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => ({
      model: m.name,
      label: `${m.name} (local)`,
    }));
  } catch {
    return [];
  }
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const ollamaUp = await isOllamaReachable();
  return [
    {
      provider: "anthropic",
      label: PROVIDER_LABELS.anthropic,
      configured: hasApiKey("anthropic"),
      requiresKey: true,
    },
    {
      provider: "openai",
      label: PROVIDER_LABELS.openai,
      configured: hasApiKey("openai"),
      requiresKey: true,
    },
    {
      provider: "ollama",
      label: PROVIDER_LABELS.ollama,
      configured: ollamaUp,
      requiresKey: false,
    },
  ];
}

/** Returns every model the user can currently run, plus availability flags. */
export async function listAvailableModels(): Promise<ModelInfo[]> {
  const out: ModelInfo[] = [];
  const anthropicOk = hasApiKey("anthropic");
  const openaiOk = hasApiKey("openai");

  for (const m of CATALOG.anthropic) {
    out.push(toModelInfo("anthropic", m, anthropicOk));
  }
  for (const m of CATALOG.openai) {
    out.push(toModelInfo("openai", m, openaiOk));
  }

  const installed = await listOllamaModels();
  const ollamaModels = installed.length > 0 ? installed : CATALOG.ollama;
  const ollamaUp = await isOllamaReachable();
  for (const m of ollamaModels) {
    out.push(toModelInfo("ollama", m, ollamaUp));
  }
  return out;
}

function toModelInfo(
  provider: ProviderId,
  m: { model: string; label: string },
  available: boolean,
): ModelInfo {
  return {
    id: `${provider}:${m.model}`,
    provider,
    model: m.model,
    label: m.label,
    available,
  };
}
