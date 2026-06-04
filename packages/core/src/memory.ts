import { generateText } from "ai";
import { nanoid } from "nanoid";
import { desc, eq, getDb, memories } from "@lgnc/db";
import {
  blobToVector,
  cosineSimilarity,
  embed,
  vectorToBlob,
} from "./embeddings.js";
import { getLanguageModel } from "./providers.js";
import type { ChatMessage, MemoryItem } from "./types.js";

function rowToItem(row: {
  id: string;
  content: string;
  sourceConversationId: string | null;
  createdAt: number;
}): MemoryItem {
  return {
    id: row.id,
    content: row.content,
    sourceConversationId: row.sourceConversationId,
    createdAt: row.createdAt,
  };
}

export async function addMemory(
  content: string,
  sourceConversationId: string | null = null,
): Promise<MemoryItem> {
  const db = getDb();
  const id = nanoid();
  const vec = await embed(content);
  db.insert(memories)
    .values({
      id,
      content: content.trim(),
      sourceConversationId,
      embedding: vec ? vectorToBlob(vec) : null,
    })
    .run();
  return {
    id,
    content: content.trim(),
    sourceConversationId,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function listMemories(limit = 200): MemoryItem[] {
  const db = getDb();
  return db
    .select()
    .from(memories)
    .orderBy(desc(memories.createdAt))
    .limit(limit)
    .all()
    .map(rowToItem);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.delete(memories).where(eq(memories.id, id)).run();
}

export function clearMemories(): void {
  const db = getDb();
  db.delete(memories).run();
}

/**
 * Retrieves the most relevant memories for a query using local embeddings.
 * Falls back to most-recent memories when embeddings are unavailable.
 */
export async function retrieveRelevant(
  query: string,
  k = 5,
): Promise<MemoryItem[]> {
  const db = getDb();
  const rows = db.select().from(memories).orderBy(desc(memories.createdAt)).all();
  if (rows.length === 0) return [];

  const queryVec = await embed(query);
  if (!queryVec) {
    return rows.slice(0, k).map(rowToItem);
  }

  const scored: MemoryItem[] = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const vec = blobToVector(row.embedding as Buffer);
    const score = cosineSimilarity(queryVec, vec);
    scored.push({ ...rowToItem(row), score });
  }

  if (scored.length === 0) return rows.slice(0, k).map(rowToItem);

  return scored
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((m) => (m.score ?? 0) > 0.2)
    .slice(0, k);
}

const EXTRACTION_SYSTEM = `You extract durable, reusable facts about the user from a conversation.
Capture stable preferences, identity, projects, tools, goals, and working style.
Ignore one-off task details, questions, and transient context.
Return ONLY a JSON array of short first-person-about-the-user strings (max 6).
If there is nothing worth remembering, return [].
Examples: ["Prefers TypeScript over Python", "Working on an app called LgNc", "Likes concise answers"]`;

/**
 * Uses the chat model to extract durable memories from the latest turn,
 * then stores any new ones with embeddings. Non-fatal: returns [] on failure.
 */
export async function extractAndStoreMemories(
  modelId: string,
  recent: ChatMessage[],
  conversationId: string | null,
): Promise<MemoryItem[]> {
  const transcript = recent
    .filter((m) => m.role !== "system")
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  if (!transcript.trim()) return [];

  try {
    const { text } = await generateText({
      model: getLanguageModel(modelId),
      system: EXTRACTION_SYSTEM,
      prompt: `Conversation:\n${transcript}\n\nExtract durable facts as a JSON array.`,
      maxTokens: 300,
    });
    const facts = parseFacts(text);
    const existing = new Set(
      listMemories(500).map((m) => m.content.toLowerCase().trim()),
    );
    const created: MemoryItem[] = [];
    for (const fact of facts) {
      const norm = fact.toLowerCase().trim();
      if (!norm || existing.has(norm)) continue;
      existing.add(norm);
      created.push(await addMemory(fact, conversationId));
    }
    return created;
  } catch (err) {
    console.warn(
      "[lgnc/core] Memory extraction skipped:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

function parseFacts(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    return [];
  }
}

/** Builds the system-prompt fragment that injects relevant memories. */
export function buildMemoryContext(items: MemoryItem[]): string {
  if (items.length === 0) return "";
  const bullets = items.map((m) => `- ${m.content}`).join("\n");
  return `What you remember about the user (use naturally, do not recite verbatim):\n${bullets}`;
}
