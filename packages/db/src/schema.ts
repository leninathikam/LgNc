import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  // Rolling summary of older turns, produced by auto-compaction.
  summary: text("summary"),
  // How many of the conversation's messages (in order) are covered by `summary`.
  summarizedCount: integer("summarized_count").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  model: text("model"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  provider: text("provider").primaryKey(),
  // Encrypted at rest (AES-256-GCM). Never stored or transmitted in plaintext.
  encrypted: text("encrypted").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  // Where this memory came from: which conversation produced it.
  sourceConversationId: text("source_conversation_id"),
  // Float32 embedding vector stored as a raw blob (null if embedding unavailable).
  embedding: blob("embedding"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
