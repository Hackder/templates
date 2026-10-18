import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { test as base, expect } from "@playwright/test";
import type { AppEnvInput } from "../src/env";
import { E2E_DATA_DIR, E2E_MOCK_NOW } from "./constants";

// Every Playwright worker runs its own app server, on a port of its own and
// with a database and a log of its own. So a test's page changes only
// because of tests in its own worker, and runs started at once (each with
// its own `--output`) cannot meet either.

type AppEnv = Record<string, string>;

/**
 * `env`'s arguments that run `cmd` with this process's environment plus
 * `appEnv`; explicit variables beat anything Bun would load from .env.
 */
function withEnv(appEnv: AppEnv, cmd: string[]): string[] {
  return [...Object.entries(appEnv).map(([k, v]) => `${k}=${v}`), ...cmd];
}

/** Runs `cmd` and fails with its output unless it succeeds. */
function run(appEnv: AppEnv, cmd: string[]): void {
  const result = spawnSync("env", withEnv(appEnv, cmd), { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${cmd.join(" ")} failed (${String(result.status)}):\n${result.stdout}${result.stderr}`,
    );
  }
}

/**
 * Starts the app and resolves with its address once it listens: PORT=0
 * lets the system pick a free port, which the app prints as its "Local"
 * address after it started listening.
 */
async function startApp(
  appEnv: AppEnv,
): Promise<{ app: ChildProcess; baseURL: string }> {
  // Without .env: a developer's own settings there (a password hash, say)
  // must not change what the tests run against.
  const app = spawn(
    "env",
    withEnv(appEnv, ["bun", "--no-env-file", "run", "src/main.ts"]),
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const { stdout } = app;
  const early = Promise.withResolvers<never>();
  function exitedEarly(code: number | null): void {
    early.reject(
      new Error(`The app exited (${String(code)}) before listening`),
    );
  }
  app.once("exit", exitedEarly);
  const listening = (async () => {
    for await (const line of createInterface({ input: stdout })) {
      const match = /^\s*Local\s+(http:\/\/\S+)$/.exec(line);
      if (match?.[1] !== undefined) {
        return match[1];
      }
    }
    throw new Error("The app closed its output before listening");
  })();
  const baseURL = await Promise.race([listening, early.promise]);
  app.off("exit", exitedEarly);
  // Keep reading, so a full pipe never blocks the app.
  stdout.resume();
  return { app, baseURL };
}

async function stopApp(app: ChildProcess): Promise<void> {
  if (app.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((done) => {
    app.once("exit", () => {
      done();
    });
  });
  app.kill("SIGTERM");
  await exited;
}

interface WorkerFixtures {
  /**
   * The server's AUTH_PASSWORD_HASH; unset (the default) leaves the app
   * open. A spec sets it with `test.use`, and Playwright gives it workers,
   * and so servers, of its own.
   */
  passwordHash: string | undefined;
  serverURL: string;
}

export const test = base.extend<object, WorkerFixtures>({
  passwordHash: [undefined, { scope: "worker", option: true }],
  serverURL: [
    async ({ passwordHash }, use) => {
      mkdirSync(E2E_DATA_DIR, { recursive: true });
      const dir = resolve(mkdtempSync(join(E2E_DATA_DIR, "worker-")));
      // Explicit env beats anything Bun would load from .env, so the server
      // can never touch a real database; prepare.ts double-checks.
      const appEnv = {
        NODE_ENV: "test",
        PORT: "0",
        TURSO_DATABASE_URL: `file:${join(dir, "app.db")}`,
        TURSO_REMOTE_SYNC_URL: "disabled",
        TURSO_SYNC_PULL_INTERVAL_MS: "disabled",
        MOCK_TIME: E2E_MOCK_NOW,
        LOG_LEVEL: "warn",
        LOG_JSON_FILE: join(dir, "log.ndjson"),
      } satisfies AppEnvInput;
      const serverEnv =
        passwordHash === undefined
          ? appEnv
          : { ...appEnv, AUTH_PASSWORD_HASH: passwordHash };
      run(appEnv, ["bun", "run", "e2e/prepare.ts"]);
      const { app, baseURL } = await startApp(serverEnv);
      try {
        await use(baseURL);
      } finally {
        await stopApp(app);
        rmSync(dir, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ serverURL }, use) => {
    await use(serverURL);
  },
});

export { expect };
