import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { instrumentClient } from "./db-instrument";
import { env } from "./env";
import * as schema from "./schema";

const rawClient = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
  syncUrl: env.TURSO_REMOTE_SYNC_URL,
  syncInterval:
    env.TURSO_SYNC_PULL_INTERVAL_MS !== undefined
      ? Math.ceil(env.TURSO_SYNC_PULL_INTERVAL_MS / 1000)
      : undefined,
  readYourWrites: true,
});

const client = instrumentClient(rawClient);

export const db = drizzle(client, { schema });
export type Db = typeof db;

/**
 * Releases the libSQL connection and its background sync timer so a one-off
 * script can end on its own instead of calling `process.exit`, which would
 * truncate buffered stdout when the output is piped.
 */
export function closeDb(): void {
  rawClient.close();
}
