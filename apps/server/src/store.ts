import { nanoid } from "nanoid";
import {
  conversations,
  desc,
  eq,
  getDb,
  messages,
  sql,
  type Conversation,
  type Message,
} from "@lgnc/db";

export function listConversations(): Conversation[] {
  return getDb()
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export function getConversation(id: string): Conversation | undefined {
  return getDb().select().from(conversations).where(eq(conversations.id, id)).get();
}

export function getMessages(conversationId: string): Message[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    // rowid tiebreaker keeps ordering stable for messages added in the same second.
    .orderBy(messages.createdAt, sql`rowid`)
    .all();
}

export function createConversation(title = "New chat"): Conversation {
  const id = nanoid();
  const db = getDb();
  db.insert(conversations).values({ id, title }).run();
  return getConversation(id)!;
}

export function ensureConversation(id: string | undefined): Conversation {
  if (id) {
    const existing = getConversation(id);
    if (existing) return existing;
  }
  return createConversation();
}

export function addMessage(
  conversationId: string,
  role: Message["role"],
  content: string,
  model?: string,
): Message {
  const db = getDb();
  const id = nanoid();
  db.insert(messages).values({ id, conversationId, role, content, model }).run();
  db.update(conversations)
    .set({ updatedAt: sql`(unixepoch())` })
    .where(eq(conversations.id, conversationId))
    .run();
  return getDb().select().from(messages).where(eq(messages.id, id)).get()!;
}

export function updateConversationSummary(
  id: string,
  summary: string | null,
  summarizedCount: number,
): void {
  getDb()
    .update(conversations)
    .set({ summary, summarizedCount })
    .where(eq(conversations.id, id))
    .run();
}

export function renameConversation(id: string, title: string): void {
  getDb()
    .update(conversations)
    .set({ title: title.slice(0, 80) })
    .where(eq(conversations.id, id))
    .run();
}

export function deleteConversation(id: string): void {
  getDb().delete(conversations).where(eq(conversations.id, id)).run();
}

/** Derives a short title from the first user message. */
export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean || "New chat";
}
