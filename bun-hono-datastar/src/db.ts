import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "./env";
import * as schema from "./schema";

export const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
  syncUrl: env.TURSO_REMOTE_SYNC_URL,
  syncInterval: Math.ceil(env.TURSO_SYNC_PULL_INTERVAL_MS / 1000),
  readYourWrites: true,
});

export const db = drizzle(client, { schema });
