import { resolveDataDir, resolveDbPath } from "./paths.js";
import { getDb } from "./client.js";

// Running this module initializes the data directory and applies the schema.
getDb();
console.log(`[lgnc/db] Database ready.`);
console.log(`  data dir: ${resolveDataDir()}`);
console.log(`  database: ${resolveDbPath()}`);
