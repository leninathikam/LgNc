import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDb, resolveDataDir } from "@lgnc/db";
import { chatRoute } from "./routes/chat.js";
import { keysRoute } from "./routes/keys.js";
import { settingsRoute } from "./routes/settings.js";
import { memoriesRoute } from "./routes/memories.js";
import { conversationsRoute } from "./routes/conversations.js";
import { providersRoute } from "./routes/providers.js";

// Initialize the local database (creates ~/.lgnc and tables on first run).
getDb();

const app = new Hono();

// Local-first: the web app and server run on the same machine.
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true, name: "lgnc", version: "0.1.0" }));

app.route("/api/chat", chatRoute);
app.route("/api/keys", keysRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/memories", memoriesRoute);
app.route("/api/conversations", conversationsRoute);
app.route("/api/providers", providersRoute);

const port = Number(process.env.SERVER_PORT || 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`\n  LgNc server running at http://localhost:${info.port}`);
  console.log(`  Local data: ${resolveDataDir()}\n`);
});
