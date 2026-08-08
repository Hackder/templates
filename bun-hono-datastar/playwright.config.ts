import { defineConfig, devices } from "@playwright/test";
import { env, type AppEnvInput } from "./src/env";
import { E2E_DATABASE_URL, E2E_MOCK_NOW, E2E_PORT } from "./e2e/constants";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  retries: 0,
  forbidOnly: env.CI,
  reporter: env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(env.CI
      ? []
      : [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]),
  ],
  webServer: {
    command:
      "bun run tailwind:build && bun run e2e/prepare.ts && bun run src/main.ts",
    port: E2E_PORT,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      PORT: String(E2E_PORT),
      TURSO_DATABASE_URL: E2E_DATABASE_URL,
      TURSO_REMOTE_SYNC_URL: "disabled",
      MOCK_TIME: E2E_MOCK_NOW,
    } satisfies AppEnvInput,
  },
});
