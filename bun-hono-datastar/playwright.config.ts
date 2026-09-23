import { defineConfig, devices } from "@playwright/test";
import { env, type AppEnvInput } from "./src/env";
import { E2E_DATABASE_URL, E2E_MOCK_NOW, E2E_PORT } from "./e2e/constants";

export default defineConfig({
  testDir: "./e2e",
  // *.e2e.ts so `bun test` (which picks up *.test.* and *.spec.*) never
  // tries to run Playwright specs.
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  // Deliberately no retries, in CI included: a test that needs a retry is a
  // flaky test we want to see fail and fix, not tolerate.
  retries: 0,
  // Fail CI if a stray `test.only` is committed
  forbidOnly: env.CI,
  // The github reporter annotates failing lines directly in the PR diff
  reporter: env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // WebKit because Mobile Safari is a first-class target (see AGENTS.md).
    // Skipped on CI: it is much slower there and the current specs cover
    // behavior identical across engines. Locally it runs by default; use
    // `bun run test:e2e --project=webkit` to run it alone.
    ...(env.CI
      ? []
      : [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]),
  ],
  webServer: {
    command:
      "bun run tailwind:build && bun run e2e/prepare.ts && bun run src/main.ts",
    port: E2E_PORT,
    reuseExistingServer: false,
    // Explicit env beats anything Bun would auto-load from .env, so the
    // server can never touch a real database. prepare.ts double-checks this.
    env: {
      NODE_ENV: "test",
      PORT: String(E2E_PORT),
      TURSO_DATABASE_URL: E2E_DATABASE_URL,
      TURSO_REMOTE_SYNC_URL: "disabled",
      TURSO_SYNC_PULL_INTERVAL_MS: "disabled",
      MOCK_TIME: E2E_MOCK_NOW,
      LOG_LEVEL: "warn",
    } satisfies AppEnvInput,
  },
});
