import fs from "node:fs";
import nodePath from "node:path";
import { createConsoleFormatter } from "./format";
import type { Level, LogRecord } from "./record";

// Sinks run inside the logging worker (`worker.ts`), so blocking here is
// fine: it is never the request thread.

export interface Sink {
  emit: (records: LogRecord[]) => void;
  /** Resolves once everything emitted so far has been written or shipped. */
  flush: () => Promise<void>;
}

interface ConsoleSinkOptions {
  level: Level;
}

export function consoleSink(options: ConsoleSinkOptions): Sink {
  const formatter = createConsoleFormatter({ level: options.level });
  return {
    emit: (records) => {
      let out = "";
      for (const record of records) {
        const line = formatter.format(record);
        if (line !== undefined) {
          out += `${line}\n`;
        }
      }
      if (out !== "") {
        fs.writeSync(1, out);
      }
    },
    flush: () => Promise.resolve(),
  };
}

/**
 * Appends one JSON line per record (NDJSON) for the log viewer in
 * `tools/logview`.
 *
 * The file is truncated lazily on the first batch, so every process run
 * starts fresh, but merely starting the worker never clobbers another
 * process's log file.
 */
export function ndjsonSink(path: string): Sink {
  let initialized = false;
  return {
    emit: (records) => {
      if (!initialized) {
        fs.mkdirSync(nodePath.dirname(path), { recursive: true });
        const temporaryPath = `${path}.${process.pid}.tmp`;
        fs.writeFileSync(temporaryPath, "");
        fs.renameSync(temporaryPath, path);
        initialized = true;
      }
      let out = "";
      for (const record of records) {
        out += `${JSON.stringify(record)}\n`;
      }
      fs.appendFileSync(path, out);
    },
    flush: () => Promise.resolve(),
  };
}
