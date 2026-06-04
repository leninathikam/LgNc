import { generateText } from "ai";
import { getLanguageModel, parseModelId } from "./providers.js";
import {
  getCompactionThreshold,
  getKeepRecentMessages,
  getSetting,
  SETTING_KEYS,
} from "./settings.js";
import type { ChatMessage, ProviderId } from "./types.js";

// Approximate input context windows (in tokens). Conservative on purpose --
// underestimating just makes compaction trigger a little earlier, which is safe.
const DEFAULT_CONTEXT_WINDOW = 8_192;

const CONTEXT_WINDOWS: { match: RegExp; provider: ProviderId; tokens: number }[] = [
  { provider: "anthropic", match: /claude-3-5|claude-3\.5|sonnet|haiku/i, tokens: 200_000 },
  { provider: "anthropic", match: /opus/i, tokens: 200_000 },
  { provider: "anthropic", match: /.*/, tokens: 200_000 },
  { provider: "openai", match: /gpt-4o/i, tokens: 128_000 },
  { provider: "openai", match: /o3|o1/i, tokens: 200_000 },
  { provider: "openai", match: /.*/, tokens: 128_000 },
  { provider: "ollama", match: /llama3|llama-3/i, tokens: 131_072 },
  { provider: "ollama", match: /qwen2|mistral|gemma/i, tokens: 32_768 },
];

/** Best-effort context window size (in tokens) for a "provider:model" id. */
export function getContextWindow(modelId: string): number {
  try {
    const { provider, model } = parseModelId(modelId);
    for (const entry of CONTEXT_WINDOWS) {
      if (entry.provider === provider && entry.match.test(model)) {
        return entry.tokens;
      }
    }
  } catch {
    // fall through
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Rough token estimate (~4 chars/token) plus a small per-message overhead.
 * Good enough to drive a fill-percentage threshold; we keep margin elsewhere.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateTokens(m.content) + 4;
  return total;
}

export interface PreparedContext {
  /** User/assistant messages to send to the model (recent, verbatim). */
  messages: ChatMessage[];
  /** Rolling summary of older turns to fold into the system prompt, if any. */
  summary: string | null;
  /** Whether compaction ran (and thus the stored summary changed) this call. */
  compacted: boolean;
  /** New summarized-message count to persist when `compacted` is true. */
  summarizedCount: number;
  /** Diagnostics. */
  usageBeforeTokens: number;
  contextWindow: number;
}

const SUMMARY_SYSTEM = `You compress a chat conversation into a dense summary for later context.
Preserve: the user's goals, decisions made, facts/preferences revealed, open questions, and any important specifics (names, values, file paths).
Drop: pleasantries and redundant phrasing.
If an existing summary is provided, merge the new turns into it. Keep it under ~400 words. Output only the summary prose.`;

/**
 * Decides whether the conversation needs compaction and, if so, summarizes the
 * older messages into a rolling summary. Returns the exact context to send.
 *
 * @param systemOverheadText  System prompt + memory block already planned for
 *                            this request (counted against the token budget).
 */
export async function prepareContext(opts: {
  modelId: string;
  allMessages: ChatMessage[];
  storedSummary: string | null;
  storedSummarizedCount: number;
  systemOverheadText: string;
  reserveForResponse?: number;
}): Promise<PreparedContext> {
  const {
    modelId,
    allMessages,
    storedSummary,
    storedSummarizedCount,
    systemOverheadText,
    reserveForResponse = 1_024,
  } = opts;

  const contextWindow = getContextWindow(modelId);
  const threshold = getCompactionThreshold();
  const keepRecent = getKeepRecentMessages();

  // Budget = threshold% of the window, minus room for the model's reply.
  const budget = Math.max(
    512,
    Math.floor(contextWindow * threshold) - reserveForResponse,
  );

  // Messages not yet folded into the stored summary.
  const clampedCount = Math.min(storedSummarizedCount, allMessages.length);
  let summary = storedSummary;
  let summarizedCount = clampedCount;
  let active = allMessages.slice(clampedCount);

  const overheadTokens =
    estimateTokens(systemOverheadText) +
    (summary ? estimateTokens(summary) + 8 : 0);
  const usageBeforeTokens = overheadTokens + estimateMessagesTokens(active);

  // Under budget: nothing to do.
  if (usageBeforeTokens <= budget) {
    return {
      messages: active,
      summary,
      compacted: false,
      summarizedCount,
      usageBeforeTokens,
      contextWindow,
    };
  }

  // Over budget: keep the most recent `keepRecent` messages verbatim and
  // summarize everything before them (merging into any existing summary).
  const cutoff = Math.max(0, allMessages.length - keepRecent);
  const toSummarize = allMessages.slice(clampedCount, cutoff);

  if (toSummarize.length === 0) {
    // Already as compact as our policy allows (only recent turns remain).
    return {
      messages: active,
      summary,
      compacted: false,
      summarizedCount,
      usageBeforeTokens,
      contextWindow,
    };
  }

  try {
    const summaryModelId =
      getSetting(SETTING_KEYS.summaryModel) || modelId;
    const transcript = toSummarize
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    const prompt = summary
      ? `Existing summary:\n${summary}\n\nNew turns to merge:\n${transcript}`
      : `Conversation to summarize:\n${transcript}`;

    const { text } = await generateText({
      model: getLanguageModel(summaryModelId),
      system: SUMMARY_SYSTEM,
      prompt,
      maxTokens: 700,
    });

    summary = text.trim() || summary;
    summarizedCount = cutoff;
    active = allMessages.slice(cutoff);

    return {
      messages: active,
      summary,
      compacted: true,
      summarizedCount,
      usageBeforeTokens,
      contextWindow,
    };
  } catch (err) {
    // Summarization failed (e.g. provider error): degrade gracefully by
    // truncating to the recent window without a new summary.
    console.warn(
      "[lgnc/core] Compaction summarization failed, truncating instead:",
      err instanceof Error ? err.message : err,
    );
    return {
      messages: allMessages.slice(cutoff),
      summary,
      compacted: false,
      summarizedCount,
      usageBeforeTokens,
      contextWindow,
    };
  }
}

/** Builds the system-prompt fragment that carries the rolling summary. */
export function buildSummaryContext(summary: string | null): string {
  if (!summary) return "";
  return `Summary of earlier conversation (for context; continue naturally):\n${summary}`;
}
