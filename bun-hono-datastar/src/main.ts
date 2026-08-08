import os from "node:os";
import { Temporal } from "temporal-polyfill";
import { app } from "./app";
import { env } from "./env";

if (env.MOCK_TIME !== undefined) {
  const fakeTimers = await import("@sinonjs/fake-timers");
  fakeTimers.install({
    now: Temporal.Instant.from(env.MOCK_TIME).epochMilliseconds,
    toFake: ["Date", "Intl"],
  });
}

const server = Bun.serve({
  fetch: app.fetch,
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
