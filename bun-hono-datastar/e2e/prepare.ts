import { resolve, sep } from "node:path";
import { env } from "../src/env";
import { E2E_DATA_DIR } from "./constants";

// Creates the schema of a worker's fresh database (e2e/fixtures.ts), and
// refuses any database outside the E2E data directory.

const dataDir = resolve(E2E_DATA_DIR) + sep;
const url = env.TURSO_DATABASE_URL;
if (!url.startsWith("file:") || !resolve(url.slice(5)).startsWith(dataDir)) {
  throw new Error(`Refusing to prepare ${url}; expected one in ${dataDir}`);
}
if (env.TURSO_REMOTE_SYNC_URL !== undefined) {
  throw new Error("E2E database must not synchronize with a remote database");
}
if (env.MOCK_TIME === undefined) {
  throw new Error("E2E tests require MOCK_TIME");
}

const push = Bun.spawnSync({
  cmd: ["bun", "run", "db:push"],
  stdout: "inherit",
  stderr: "inherit",
});
if (push.exitCode !== 0) {
  throw new Error(`bun run db:push failed with exit code ${push.exitCode}`);
}
