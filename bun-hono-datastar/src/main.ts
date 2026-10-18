import os from "node:os";
import { flushDeviceWrites, loadDevices } from "./auth/devices";
import { PASSWORD_GATE } from "./auth/password";
import { app } from "./web/web";
import { ensureDotEnv, env } from "./env";
import { closeDb, db } from "./db";
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

if (PASSWORD_GATE) {
  // Signed-in devices, before serving: the gate looks them up in memory.
  await loadDevices(db);
} else if (env.NODE_ENV === "production") {
  logger().warn(
    "AUTH_PASSWORD_HASH is not set: the app is public, anyone who can reach it can use it",
  );
}

const server = Bun.serve({
  // The client's address reaches the routes as a binding (see AppEnv in
  // src/web/auth.tsx).
  fetch: (request, bunServer) =>
    app.fetch(request, {
      connectionIp: bunServer.requestIP(request)?.address,
    }),
  error: (error) => {
    // Hono handles request errors itself. Reaching Bun means rendering that
    // error response also failed, so bypass the app and report directly.
    logger().error("Failed to render error response", { err: error });
    return new Response("Internal Server Error", { status: 500 });
  },
  development: env.NODE_ENV === "development",
  hostname: env.HOST,
  port: env.PORT,
  // Bun's default is 128MB. Actions post a few signals and /login has its
  // own, tighter limit (src/web/auth.tsx).
  maxRequestBodySize: 1024 * 1024,
  // /updates streams stay open indefinitely.
  idleTimeout: 0,
});

// A deploy stops the container with SIGTERM. First the server stops, so no
// request changes anything any more; it closes open connections too, since
// /updates streams never end on their own. Then the queued device writes
// finish, and only then is the database connection (and an embedded
// replica's sync) closed, before the logger's last flush and exit.
onShutdown(async () => {
  await server.stop(true);
  await flushDeviceWrites();
  closeDb();
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
