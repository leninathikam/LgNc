import { apiKeys, eq, getDb } from "@lgnc/db";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { ProviderId } from "./types.js";

const ENV_FALLBACK: Partial<Record<ProviderId, string | undefined>> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};

/** Returns the decrypted API key for a provider, preferring the stored value over env. */
export function getApiKey(provider: ProviderId): string | undefined {
  const db = getDb();
  const row = db.select().from(apiKeys).where(eq(apiKeys.provider, provider)).get();
  if (row) {
    try {
      return decryptSecret(row.encrypted);
    } catch {
      // Corrupted/rotated secret: fall through to env.
    }
  }
  return ENV_FALLBACK[provider]?.trim() || undefined;
}

export function setApiKey(provider: ProviderId, key: string): void {
  const db = getDb();
  const encrypted = encryptSecret(key.trim());
  db.insert(apiKeys)
    .values({ provider, encrypted })
    .onConflictDoUpdate({ target: apiKeys.provider, set: { encrypted } })
    .run();
}

export function deleteApiKey(provider: ProviderId): void {
  const db = getDb();
  db.delete(apiKeys).where(eq(apiKeys.provider, provider)).run();
}

/** True if a usable key exists (stored or via env). */
export function hasApiKey(provider: ProviderId): boolean {
  return Boolean(getApiKey(provider));
}
