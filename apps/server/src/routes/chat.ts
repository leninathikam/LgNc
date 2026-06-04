import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { streamText } from "ai";
import { z } from "zod";
import {
  buildMemoryContext,
  extractAndStoreMemories,
  getLanguageModel,
  getSetting,
  isMemoryEnabled,
  ProviderNotConfiguredError,
  retrieveRelevant,
  SETTING_KEYS,
  type ChatMessage,
} from "@lgnc/core";
import {
  addMessage,
  ensureConversation,
  getMessages,
  renameConversation,
  titleFromText,
} from "../store.js";

const bodySchema = z.object({
  conversationId: z.string().optional(),
  model: z.string().min(1),
  message: z.string().min(1),
});

export const chatRoute = new Hono();

chatRoute.post("/", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const { model, message } = parsed.data;

  const conversation = ensureConversation(parsed.data.conversationId);
  const isFirstMessage = getMessages(conversation.id).length === 0;
  addMessage(conversation.id, "user", message);
  if (isFirstMessage) {
    renameConversation(conversation.id, titleFromText(message));
  }

  // Build the prompt: optional memory context + base system prompt + history.
  const history = getMessages(conversation.id).map<ChatMessage>((m) => ({
    role: m.role,
    content: m.content,
  }));

  const systemParts: string[] = [];
  const basePrompt =
    getSetting(SETTING_KEYS.systemPrompt) ||
    "You are LgNc, a helpful personal assistant that lives on the user's machine. Be clear, concise, and genuinely useful.";
  systemParts.push(basePrompt);

  if (isMemoryEnabled()) {
    const relevant = await retrieveRelevant(message, 5);
    const memContext = buildMemoryContext(relevant);
    if (memContext) systemParts.push(memContext);
  }

  let languageModel;
  try {
    languageModel = getLanguageModel(model);
  } catch (err) {
    const msg =
      err instanceof ProviderNotConfiguredError
        ? err.message
        : `Could not load model "${model}".`;
    return c.json({ error: msg, conversationId: conversation.id }, 400);
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "meta",
      data: JSON.stringify({ conversationId: conversation.id, title: conversation.title }),
    });

    let full = "";
    try {
      const result = streamText({
        model: languageModel,
        system: systemParts.join("\n\n"),
        messages: history.filter((m) => m.role !== "system"),
      });

      for await (const delta of result.textStream) {
        full += delta;
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: delta }) });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: msg }) });
      return;
    }

    if (full.trim()) {
      addMessage(conversation.id, "assistant", full, model);
    }
    await stream.writeSSE({ event: "done", data: JSON.stringify({ done: true }) });

    // Learn from this turn in the background (best-effort, non-blocking).
    if (isMemoryEnabled() && full.trim()) {
      const turn: ChatMessage[] = [
        { role: "user", content: message },
        { role: "assistant", content: full },
      ];
      void extractAndStoreMemories(model, turn, conversation.id).then(
        (created) => {
          if (created.length > 0) {
            console.log(`[lgnc] Learned ${created.length} new memory item(s).`);
          }
        },
      );
    }
  });
});
