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
      summary TEXT,
      summarized_count INTEGER NOT NULL DEFAULT 0,
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

  // Idempotent column additions for databases created before auto-compaction.
  addColumnIfMissing(sqlite, "conversations", "summary", "TEXT");
  addColumnIfMissing(
    sqlite,
    "conversations",
    "summarized_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
