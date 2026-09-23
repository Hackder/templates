import os from "node:os";
import { app } from "./app";
import { ensureDotEnv, env } from "./env";
import { logger } from "./logger";

// `.bun-version` is the pinned Bun release (see bun-version.test.ts). Bun does
// not enforce it, so surface a mismatch loudly instead of letting a different
// runtime run silently.
const pinnedBunVersion = (
  await Bun.file(new URL("../.bun-version", import.meta.url)).text()
).trim();
if (Bun.version !== pinnedBunVersion) {
  logger().warn("Running Bun version differs from the pinned .bun-version", {
    running: Bun.version,
    pinned: pinnedBunVersion,
  });
}

if (env.NODE_ENV === "development") {
  await ensureDotEnv();
}

if (env.MOCK_TIME) {
  const { setSystemTime } = await import("bun:test");
  setSystemTime(env.MOCK_TIME);
  logger().info("Fake timers installed", {
    now: Temporal.Now.instant(),
  });
}

const server = Bun.serve({
  fetch: app.fetch,
  error: (error) => {
    // Hono handles request errors itself. Reaching Bun means rendering that
    // error response also failed, so bypass the app and report directly.
    logger().error("Failed to render error response", { err: error });
    return new Response("Internal Server Error", { status: 500 });
  },
  development: env.NODE_ENV === "development",
  port: env.PORT,
  idleTimeout: 0,
});

const localUrl = server.url.toString().replace(/\/$/, "");
const port = server.url.port === "" ? "80" : server.url.port;
const listens: [string, string][] = [["Local", localUrl]];

for (const [ifaceName, infos] of Object.entries(os.networkInterfaces())) {
  if (infos === undefined) {
    continue;
  }

  for (const info of infos) {
    if (info.family === "IPv4" && !info.internal) {
      listens.push([
        `Network (${ifaceName})`,
        `${server.url.protocol}//${info.address}:${port}`,
      ]);
    }
  }
}

let maxHeaderLength = 0;
for (const [header, _] of listens) {
  maxHeaderLength = Math.max(maxHeaderLength, header.length);
}

console.log("");
for (const [header, url] of listens) {
  const headerText = header;
  console.log(`  ${headerText.padEnd(maxHeaderLength, " ")}   ${url}`);
}

if (env.NODE_ENV === "development") {
  console.log(
    "\n  Run `bun run tailwind` in another terminal for live CSS updates.\n",
  );
}
