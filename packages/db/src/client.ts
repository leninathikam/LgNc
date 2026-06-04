import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { resolveDataDir, resolveDbPath } from "./paths.js";
import * as schema from "./schema.js";

export type DB = BetterSQLite3Database<typeof schema>;

let cached: DB | null = null;

/**
 * Opens (and lazily caches) the local SQLite database, creating the data
 * directory and tables on first use. Idempotent and safe to call anywhere.
 */
export function getDb(): DB {
  if (cached) return cached;

  mkdirSync(resolveDataDir(), { recursive: true });
  const sqlite = new Database(resolveDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite);

  cached = drizzle(sqlite, { schema });
  return cached;
}

/** Idempotent schema setup. Safe to run on every startup. */
export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      encrypted TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source_conversation_id TEXT,
      embedding BLOB,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}
