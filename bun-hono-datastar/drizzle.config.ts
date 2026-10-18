// The db:* scripts run drizzle-kit as `bun node_modules/drizzle-kit/bin.cjs`
// so this file (and src/env.ts) read .env the way Bun and the app do. Not
// `drizzle-kit …`: its bin has a node shebang, so it runs under Node. Not
// `bun --bun drizzle-kit …` either: Bun then runs the bin in Node mode, which
// skips Bun's .env loading and leaves it to drizzle-kit's dotenv (Node-style
// parsing, e.g. no `$VAR` expansion). dotenv never overrides a variable Bun
// already set.
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

const dbFile = env.TURSO_DATABASE_URL.replace("file:", "");
mkdirSync(dirname(dbFile), { recursive: true });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  },
});
