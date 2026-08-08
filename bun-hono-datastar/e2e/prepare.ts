import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../src/env";
import { E2E_DATABASE_URL } from "./constants";

if (env.TURSO_DATABASE_URL !== E2E_DATABASE_URL) {
  throw new Error(
    `Refusing to prepare ${env.TURSO_DATABASE_URL}; expected ${E2E_DATABASE_URL}`,
  );
}
if (env.TURSO_REMOTE_SYNC_URL !== undefined) {
  throw new Error("E2E database must not synchronize with a remote database");
}
if (env.MOCK_TIME === undefined) {
  throw new Error("E2E tests require MOCK_TIME");
}

const databaseFile = env.TURSO_DATABASE_URL.replace(/^file:/, "");
mkdirSync(dirname(databaseFile), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${databaseFile}${suffix}`, { force: true });
}

const push = Bun.spawnSync({
  cmd: ["./node_modules/.bin/drizzle-kit", "push"],
  stdout: "inherit",
  stderr: "inherit",
});
if (push.exitCode !== 0) {
  throw new Error(`drizzle-kit push failed with exit code ${push.exitCode}`);
}
