import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Resolves the directory where all local data lives (SQLite DB + secret key).
 * Honors LGNC_DATA_DIR, otherwise defaults to `~/.lgnc`.
 */
export function resolveDataDir(): string {
  const fromEnv = process.env.LGNC_DATA_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(homedir(), ".lgnc");
}

export function resolveDbPath(): string {
  return resolve(resolveDataDir(), "lgnc.db");
}

export function resolveSecretPath(): string {
  return resolve(resolveDataDir(), "secret.key");
}
