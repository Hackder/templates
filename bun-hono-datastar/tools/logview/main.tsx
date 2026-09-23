import { consoleTransport, setTransports } from "../../src/logger";
import { env } from "../../src/env";
import { startTail } from "./ingest";
import { applyLine, hasRunningSpans } from "./model";
import { notify, resetStore, store } from "./state";
import { createApp } from "./web";

// The viewer must never write into the file it is reading: keep its own
// logging on the console only.
setTransports([consoleTransport({ level: "warn" })]);

const logPath = env.LOG_JSON_FILE ?? "logs/log.ndjson";
const port = env.LOGVIEW_PORT;

startTail({
  path: logPath,
  pollMs: 200,
  onLines: (lines) => {
    for (const line of lines) {
      const error = applyLine(store, line);
      if (error !== undefined) {
        console.error("Failed to parse log line", error, line);
      }
    }
    notify();
  },
  onTruncate: () => {
    resetStore();
    notify();
  },
});

// While any span is still open, rerender on a slow tick so running bars and
// durations visibly grow.
setInterval(() => {
  if (hasRunningSpans(store)) {
    notify();
  }
}, 500);

const server = Bun.serve({
  fetch: createApp(logPath).fetch,
  port,
  idleTimeout: 0, // SSE connections stay open indefinitely.
});

console.log(`logview reading ${logPath}`);
console.log(`logview listening on ${server.url.toString()}`);
