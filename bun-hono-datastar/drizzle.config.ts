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
