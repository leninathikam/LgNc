import { Hono } from "hono";
import { z } from "zod";
import { addMemory, clearMemories, deleteMemory, listMemories } from "@lgnc/core";

const addSchema = z.object({ content: z.string().min(1) });

export const memoriesRoute = new Hono();

memoriesRoute.get("/", (c) => {
  return c.json({ memories: listMemories() });
});

memoriesRoute.post("/", async (c) => {
  const parsed = addSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Provide memory content." }, 400);
  }
  const memory = await addMemory(parsed.data.content, null);
  return c.json({ memory });
});

memoriesRoute.delete("/:id", (c) => {
  deleteMemory(c.req.param("id"));
  return c.json({ ok: true });
});

memoriesRoute.delete("/", (c) => {
  clearMemories();
  return c.json({ ok: true });
});
