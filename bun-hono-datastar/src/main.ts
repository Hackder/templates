import os from "node:os";
import { app } from "./app";
import { ensureDotEnv, env } from "./env";
import { closeDb } from "./db";
import { logger, onShutdown } from "./logger";

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

// A deploy stops the container with SIGTERM: the database connection (and an
// embedded replica's sync) is closed before the logger's last flush and exit.
onShutdown(() => {
  closeDb();
});

const server = Bun.serve({
  fetch: app.fetch,
  error: (error) => {
    // Hono handles request errors itself. Reaching Bun means rendering that
    // error response also failed, so bypass the app and report directly.
    logger().error("Failed to render error response", { err: error });
    return new Response("Internal Server Error", { status: 500 });
  },
  development: env.NODE_ENV === "development",
  hostname: env.HOST,
  port: env.PORT,
  idleTimeout: 0,
});

// A wildcard address listens on every interface: the network ones and,
// for the "Local" line, localhost. A specific address is printed as it is,
// as "Network" unless it is a loopback one.
const listensEverywhere = ["0.0.0.0", "::"].includes(env.HOST);
const loopback = /^(localhost|127\.|::1$)/.test(env.HOST);
const port = server.url.port === "" ? "80" : server.url.port;
const listens: [string, string][] = listensEverywhere
  ? [["Local", `${server.url.protocol}//localhost:${port}`]]
  : [
      [
        loopback ? "Local" : "Network",
        server.url.toString().replace(/\/$/, ""),
      ],
    ];

const interfaces = listensEverywhere ? os.networkInterfaces() : {};
for (const [ifaceName, infos] of Object.entries(interfaces)) {
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
