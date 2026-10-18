import { defineConfig, devices } from "@playwright/test";
import { env } from "./src/env";

// Every worker starts its own server (e2e/fixtures.ts), so there is no
// webServer here and the projects run side by side. Two runs at once each
// need their own `--output` (Playwright empties it when a run starts).
export default defineConfig({
  testDir: "./e2e",
  // *.e2e.ts so `bun test` (which picks up *.test.* and *.spec.*) never
  // tries to run Playwright specs.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Deliberately no retries, in CI included: a test that needs a retry is a
  // flaky test we want to see fail and fix, not tolerate.
  retries: 0,
  // Fail CI if a stray `test.only` is committed
  forbidOnly: env.CI,
  // The github reporter annotates failing lines directly in the PR diff
  reporter: env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
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
});
