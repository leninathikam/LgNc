import { getDb, settings } from "@lgnc/db";
import { eq } from "@lgnc/db";

export const SETTING_KEYS = {
  defaultModel: "default_model",
  systemPrompt: "system_prompt",
  memoryEnabled: "memory_enabled",
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
