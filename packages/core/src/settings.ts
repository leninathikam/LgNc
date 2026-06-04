import { getDb, settings } from "@lgnc/db";
import { eq } from "@lgnc/db";

export const SETTING_KEYS = {
  defaultModel: "default_model",
  systemPrompt: "system_prompt",
  memoryEnabled: "memory_enabled",
  compactionEnabled: "compaction_enabled",
  compactionThreshold: "compaction_threshold",
  keepRecentMessages: "keep_recent_messages",
  summaryModel: "summary_model",
} as const;

export function getSetting(key: string): string | undefined {
  const db = getDb();
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function isMemoryEnabled(): boolean {
  // Memory is on by default; only disabled when explicitly set to "false".
  return getSetting(SETTING_KEYS.memoryEnabled) !== "false";
}

export function isCompactionEnabled(): boolean {
  // Auto-compaction is on by default.
  return getSetting(SETTING_KEYS.compactionEnabled) !== "false";
}

/** Fraction of the model's context window at which compaction kicks in (default 0.8). */
export function getCompactionThreshold(): number {
  const raw = Number(getSetting(SETTING_KEYS.compactionThreshold));
  if (!Number.isFinite(raw) || raw <= 0 || raw >= 1) return 0.8;
  return raw;
}

/** Number of most-recent messages always kept verbatim (never summarized). */
export function getKeepRecentMessages(): number {
  const raw = Number(getSetting(SETTING_KEYS.keepRecentMessages));
  if (!Number.isInteger(raw) || raw < 2) return 6;
  return raw;
}
