import { env } from "../env";
import { jsonParse } from "../std";
import { exhaustiveCheck } from "../utils";
import { axiomSink } from "./axiom";
import {
  type LogRecord,
  logRecordSchema,
  type WorkerRequest,
  type WorkerResponse,
} from "./record";
import { consoleSink, ndjsonSink, type Sink } from "./sinks";

// The logging worker: receives batches of JSON records from the app thread
// (see `workerTransport` in index.ts) and fans them out to the sinks chosen by
// the environment. Everything slow lives here so the app thread only ever
// serializes and posts.

declare var self: Worker;

const sinks: Sink[] = [consoleSink({ level: env.LOG_LEVEL })];
if (env.LOG_JSON_FILE !== undefined) {
  sinks.push(ndjsonSink(env.LOG_JSON_FILE));
}
if (env.AXIOM_TOKEN !== undefined) {
  sinks.push(
    axiomSink({
      url: env.AXIOM_URL,
      token: env.AXIOM_TOKEN,
      tracesDataset: env.AXIOM_TRACES_DATASET,
      logsDataset: env.AXIOM_LOGS_DATASET,
      serviceName: env.AXIOM_SERVICE_NAME,
      environment: env.NODE_ENV,
    }),
  );
}

function parseRecords(lines: string): LogRecord[] {
  const records: LogRecord[] = [];
  for (const line of lines.split("\n")) {
    const json = jsonParse(line);
    if (!json.ok) {
      console.error("Logger worker received malformed record", json.error);
      continue;
    }
    const parsed = logRecordSchema.safeParse(json.value);
    if (!parsed.success) {
      console.error("Logger worker received unexpected record", parsed.error);
      continue;
    }
    records.push(parsed.data);
  }
  return records;
}

function respond(response: WorkerResponse): void {
  self.postMessage(response);
}

function emitToSinks(lines: string): void {
  const records = parseRecords(lines);
  for (const sink of sinks) {
    try {
      sink.emit(records);
    } catch (error) {
      console.error("Logger sink failed", error);
    }
  }
}

async function flushSinks(): Promise<void> {
  for (const sink of sinks) {
    try {
      await sink.flush();
    } catch (error) {
      console.error("Logger sink flush failed", error);
    }
  }
}

self.onmessage = (message: MessageEvent<WorkerRequest>) => {
  const request = message.data;
  switch (request.type) {
    case "records":
      emitToSinks(request.lines);
      respond({ type: "processed" });
      break;
    case "flush":
      void flushSinks().then(() => {
        respond({ type: "flushed", id: request.id });
      });
      break;
    default:
      exhaustiveCheck(request);
  }
};
