import { Hono } from "hono";
import { z } from "zod";
import {
  deleteApiKey,
  getProviderStatuses,
  setApiKey,
  type ProviderId,
} from "@lgnc/core";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "ollama"];

const setSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  key: z.string().min(1),
});

export const keysRoute = new Hono();

// Returns provider configuration status only -- never the keys themselves.
keysRoute.get("/", async (c) => {
  return c.json({ providers: await getProviderStatuses() });
});

keysRoute.post("/", async (c) => {
  const parsed = setSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Provide a valid provider and key." }, 400);
  }
  setApiKey(parsed.data.provider, parsed.data.key);
  return c.json({ ok: true, providers: await getProviderStatuses() });
});

keysRoute.delete("/:provider", async (c) => {
  const provider = c.req.param("provider") as ProviderId;
  if (!PROVIDERS.includes(provider)) {
    return c.json({ error: "Unknown provider" }, 400);
  }
  deleteApiKey(provider);
  return c.json({ ok: true, providers: await getProviderStatuses() });
});
