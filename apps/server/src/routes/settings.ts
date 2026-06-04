import { Hono } from "hono";
import { z } from "zod";
import { getAllSettings, setSetting } from "@lgnc/core";

const patchSchema = z.record(z.string(), z.string());

export const settingsRoute = new Hono();

settingsRoute.get("/", (c) => {
  return c.json({ settings: getAllSettings() });
});

settingsRoute.post("/", async (c) => {
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Expected a flat object of string settings." }, 400);
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    setSetting(key, value);
  }
  return c.json({ settings: getAllSettings() });
});
