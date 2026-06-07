import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
import {
  bodyLimitMiddleware,
  rateLimitMiddleware,
  initRateLimiter,
  DEFAULT_LIMIT_CONFIG,
  type LimitConfig,
} from "./middleware/limits.js";

 function getOrCreateLocalToken(): string {
   const dataDir = resolveDataDir();
   const tokenPath = path.join(dataDir, "auth.token");
   if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
   if (fs.existsSync(tokenPath)) return fs.readFileSync(tokenPath, "utf-8").trim();
   
   const newToken = crypto.randomBytes(32).toString("hex");
   fs.writeFileSync(tokenPath, newToken, "utf-8");
   return newToken;
}

const localAuthToken = getOrCreateLocalToken();
// Initialize the local database (creates ~/.lgnc and tables on first run).
getDb();

// Load request limiting configuration from environment variables
const limitConfig: LimitConfig = {
  maxBodySize: parseInt(process.env.MAX_BODY_SIZE ?? String(DEFAULT_LIMIT_CONFIG.maxBodySize)),
  maxChatBodySize: parseInt(process.env.MAX_CHAT_BODY_SIZE ?? String(DEFAULT_LIMIT_CONFIG.maxChatBodySize)),
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? String(DEFAULT_LIMIT_CONFIG.rateLimit.windowMs)),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? String(DEFAULT_LIMIT_CONFIG.rateLimit.maxRequests)),
  },
};

// Initialize rate limiter
initRateLimiter(limitConfig);

const app = new Hono();

// Local-first: the web app and server run on the same machine.
const allowedOrigins = ["http://localhost:5173", "tauri://localhost"];
app.use(
  "/api/*",
  cors({
    origin: (origin) => (!origin || allowedOrigins.includes(origin) ? origin : "http://localhost:5173"),
    credentials: true,
  })
);

// Apply request limiting middleware
app.use("*", bodyLimitMiddleware(limitConfig));
app.use("*", rateLimitMiddleware(limitConfig));
 app.use("/api/*", async (c, next) => {
   if (c.req.path === "/api/health") return await next();
 
   const authHeader = c.req.header("Authorization");
   const providedToken = authHeader?.startsWith("Bearer ") 
     ? authHeader.slice(7) 
     : c.req.header("X-Local-Token");
 
   if (!providedToken || providedToken !== localAuthToken) {
     return c.json({ error: "Unauthorized access." }, 401);
 }
   return await next();
});
app.get("/api/health", (c) => c.json({ ok: true, name: "lgnc", version: "0.1.0" }));

app.route("/api/chat", chatRoute);
app.route("/api/keys", keysRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/memories", memoriesRoute);
app.route("/api/conversations", conversationsRoute);
app.route("/api/providers", providersRoute);

const port = Number(process.env.SERVER_PORT || 8787);
const hostname = process.env.HOST || "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`\n  LgNc server running securely at http://${info.address}:${info.port}`);
  console.log(`  Local data dir: ${resolveDataDir()}`);
  console.log(`  Security: CORS restricted, Auth Token enforced.\n`);
});