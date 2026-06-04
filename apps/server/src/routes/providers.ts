import { Hono } from "hono";
import { getProviderStatuses, listAvailableModels } from "@lgnc/core";

export const providersRoute = new Hono();

providersRoute.get("/models", async (c) => {
  return c.json({ models: await listAvailableModels() });
});

providersRoute.get("/status", async (c) => {
  return c.json({ providers: await getProviderStatuses() });
});
