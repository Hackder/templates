import { createLimitedFetch, type FetchFunction } from "../utils";
import {
  isJsonObject,
  isSerializedError,
  type JsonFields,
  type JsonValue,
  type Level,
  levelOrder,
  type LogRecord,
  type SerializedError,
  type SpanCloseRecord,
  type SpanKind,
  splitErrorFields,
} from "./record";
import type { Sink } from "./sinks";

// Ships records to Axiom as OpenTelemetry OTLP/HTTP JSON, without the
// OpenTelemetry SDK: our spans already are spans, so this only translates.
//
// - Every closed span (owning or section) becomes an OTLP span in the traces
//   dataset. Fields and counters become attributes; error fields become
//   `exception` span events and set the span status to error.
// - Every event becomes an OTLP log record in the logs dataset, carrying the
//   trace and span ids so logs of a trace can be queried. Warnings and errors
//   are additionally attached to their span as span events, so they show up
//   on the waterfall timeline.
//
// Axiom wants one dataset per signal, hence two endpoints.

// --- OTLP JSON shapes (the subset we produce) ---------------------------------
// https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding: ids are
// hex strings, 64-bit integers are decimal strings, enums are integers.

interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpAnyValue[] };
}

interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

interface OtlpSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
}

const SPAN_KIND_CODES = {
  internal: 1,
  server: 2,
  client: 3,
} satisfies Record<SpanKind, number>;

const STATUS_UNSET = 0;
const STATUS_ERROR = 2;

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events: OtlpSpanEvent[];
  status: { code: number; message?: string };
}

const SEVERITY_NUMBERS = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
} satisfies Record<Level, number>;

interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: OtlpAnyValue;
  attributes: OtlpKeyValue[];
  traceId?: string;
  spanId?: string;
}

interface OtlpResource {
  attributes: OtlpKeyValue[];
}

const scope = { name: "bun-hono-datastar-logger" };

interface OtlpTracesRequest {
  resourceSpans: [
    {
      resource: OtlpResource;
      scopeSpans: [{ scope: typeof scope; spans: OtlpSpan[] }];
    },
  ];
}

interface OtlpLogsRequest {
  resourceLogs: [
    {
      resource: OtlpResource;
      scopeLogs: [{ scope: typeof scope; logRecords: OtlpLogRecord[] }];
    },
  ];
}

// --- Translation -------------------------------------------------------------

/** Epoch milliseconds (with a fractional part) to a decimal nanosecond string. */
export function toUnixNano(timeMs: number): string {
  // Splitting keeps full precision: ms * 1e6 overflows the exact integer
  // range of a double.
  const wholeMs = Math.floor(timeMs);
  const nanos = Math.round((timeMs - wholeMs) * 1_000_000);
  return (BigInt(wholeMs) * 1_000_000n + BigInt(nanos)).toString();
}

function toAnyValue(value: JsonValue): OtlpAnyValue | undefined {
  if (value === null) {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- serialization boundary over JSON
  if (typeof value === "string") {
    return { stringValue: value };
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- serialization boundary over JSON
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- serialization boundary over JSON
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (Array.isArray(value)) {
    const values: OtlpAnyValue[] = [];
    for (const entry of value) {
      // Arrays of objects are rare in our fields; keep them readable as JSON
      // text instead of modelling kvlists.
      const converted = isJsonObject(entry)
        ? { stringValue: JSON.stringify(entry) }
        : toAnyValue(entry);
      if (converted !== undefined) {
        values.push(converted);
      }
    }
    return { arrayValue: { values } };
  }
  // A nested object reaching here means the caller did not flatten it.
  return { stringValue: JSON.stringify(value) };
}

/**
 * Flattens fields into OTLP attributes with dotted keys (`filters.date`), the
 * way Axiom displays them under `attributes.custom`.
 */
export function toAttributes(fields: JsonFields, prefix = ""): OtlpKeyValue[] {
  const attributes: OtlpKeyValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const fullKey = `${prefix}${key}`;
    if (isJsonObject(value)) {
      attributes.push(...toAttributes(value, `${fullKey}.`));
      continue;
    }
    const converted = toAnyValue(value);
    if (converted !== undefined) {
      attributes.push({ key: fullKey, value: converted });
    }
  }
  return attributes;
}

function stringAttribute(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } };
}

/** The whole chain as one stack trace text, the way a reader expects it. */
function renderStackTrace(error: SerializedError): string {
  let out = error.stack ?? `${error.name}: ${error.message}`;
  for (const member of error.errors ?? []) {
    out += `\nmember error: ${renderNested(member)}`;
  }
  if (error.cause !== undefined) {
    out += `\ncaused by: ${renderNested(error.cause)}`;
  }
  return out;
}

function renderNested(value: JsonValue): string {
  return isSerializedError(value)
    ? renderStackTrace(value)
    : JSON.stringify(value);
}

/** OpenTelemetry's semantic conventions for a recorded exception. */
function exceptionEvent(
  timeMs: number,
  key: string,
  error: SerializedError,
): OtlpSpanEvent {
  return {
    timeUnixNano: toUnixNano(timeMs),
    name: "exception",
    attributes: [
      stringAttribute("exception.type", error.name),
      stringAttribute("exception.message", error.message),
      stringAttribute("exception.stacktrace", renderStackTrace(error)),
      stringAttribute("error.key", key),
    ],
  };
}

function toSpan(
  record: SpanCloseRecord,
  pendingEvents: OtlpSpanEvent[],
): OtlpSpan {
  const { fields, errors } = splitErrorFields(record.fields);
  const attributes = toAttributes(fields);
  for (const [name, amount] of Object.entries(record.counters)) {
    attributes.push({
      key: `counters.${name}`,
      value: { intValue: String(amount) },
    });
  }
  attributes.push({ key: "span.owning", value: { boolValue: record.owning } });
  if (record.traceOrigin !== undefined) {
    attributes.push(stringAttribute("trace.origin", record.traceOrigin));
  }

  const events = [...pendingEvents];
  for (const { key, error } of errors) {
    events.push(exceptionEvent(record.time, key, error));
  }
  events.sort((a, b) => (a.timeUnixNano < b.timeUnixNano ? -1 : 1));

  const [firstError] = errors;
  const status =
    firstError === undefined
      ? { code: STATUS_UNSET }
      : {
          code: STATUS_ERROR,
          message: `${firstError.error.name}: ${firstError.error.message}`,
        };

  const span: OtlpSpan = {
    traceId: record.traceId,
    spanId: record.spanId,
    name: record.name,
    kind: SPAN_KIND_CODES[record.spanKind],
    startTimeUnixNano: toUnixNano(record.startTime),
    endTimeUnixNano: toUnixNano(record.time),
    attributes,
    events,
    status,
  };
  if (record.parentSpanId !== undefined) {
    span.parentSpanId = record.parentSpanId;
  }
  return span;
}

function eventAttributes(fields: JsonFields): OtlpKeyValue[] {
  const { fields: plain, errors } = splitErrorFields(fields);
  const attributes = toAttributes(plain);
  for (const { key, error } of errors) {
    attributes.push(
      stringAttribute(`${key}.type`, error.name),
      stringAttribute(`${key}.message`, error.message),
      stringAttribute(`${key}.stacktrace`, renderStackTrace(error)),
    );
  }
  return attributes;
}

// --- Sink --------------------------------------------------------------------

export interface AxiomSinkOptions {
  /** API origin, e.g. `https://api.axiom.co`. */
  url: string;
  token: string;
  tracesDataset: string;
  logsDataset: string;
  serviceName: string;
  environment: string;
  /** Injected by tests. */
  fetchFn?: FetchFunction;
  /** Batch every this many ms (or sooner when a batch fills up). */
  flushIntervalMs?: number;
}

const BATCH_SIZE = 500;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
// Bounded queues: when Axiom is unreachable for long, old items are dropped
// rather than growing the heap. Live-ish visibility beats completeness here.
const MAX_QUEUED = 10_000;
// Warnings waiting for a long-lived span (a background job) to close are capped
// the same way; the span then carries a note of how many were left out.
const MAX_PENDING_SPAN_EVENTS = 100;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

// One limiter for the Axiom API, shared by both endpoints.
const axiomFetch = createLimitedFetch({ concurrency: 2, rps: 10 });

export function axiomSink(options: AxiomSinkOptions): Sink {
  const fetchFn = options.fetchFn ?? axiomFetch;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const origin = options.url.replace(/\/+$/u, "");
  const resource: OtlpResource = {
    attributes: [
      stringAttribute("service.name", options.serviceName),
      stringAttribute("deployment.environment", options.environment),
    ],
  };

  let spans: OtlpSpan[] = [];
  let logs: OtlpLogRecord[] = [];
  // Warn/error events waiting for their span to close, so they can ride along
  // as span events. A span that never closes (crash) leaks its entry; the
  // process is gone by then anyway.
  interface PendingSpanEvents {
    events: OtlpSpanEvent[];
    dropped: number;
  }
  const pendingSpanEvents = new Map<string, PendingSpanEvents>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let draining: Promise<void> | undefined;
  let droppedSpans = 0;
  let droppedLogs = 0;

  function enqueue<T>(queue: T[], item: T): number {
    queue.push(item);
    if (queue.length > MAX_QUEUED) {
      queue.shift();
      return 1;
    }
    return 0;
  }

  function accept(record: LogRecord): void {
    if (record.kind === "spanOpen") {
      return;
    }
    if (record.kind === "spanClose") {
      const pending = pendingSpanEvents.get(record.spanId);
      pendingSpanEvents.delete(record.spanId);
      const events = pending?.events ?? [];
      if (pending !== undefined && pending.dropped > 0) {
        events.push({
          timeUnixNano: toUnixNano(record.time),
          name: "span events dropped",
          attributes: [
            { key: "dropped", value: { intValue: String(pending.dropped) } },
          ],
        });
      }
      droppedSpans += enqueue(spans, toSpan(record, events));
      return;
    }

    const log: OtlpLogRecord = {
      timeUnixNano: toUnixNano(record.time),
      severityNumber: SEVERITY_NUMBERS[record.level],
      severityText: record.level.toUpperCase(),
      body: { stringValue: record.message },
      attributes: eventAttributes(record.fields),
    };
    if (record.context !== undefined) {
      log.attributes.push(...toAttributes(record.context, "context."));
    }
    if (record.traceId !== undefined) {
      log.traceId = record.traceId;
    }
    if (record.spanId !== undefined) {
      log.spanId = record.spanId;
    }
    droppedLogs += enqueue(logs, log);

    if (
      record.spanId !== undefined &&
      levelOrder[record.level] >= levelOrder.warn
    ) {
      const pending = pendingSpanEvents.get(record.spanId) ?? {
        events: [],
        dropped: 0,
      };
      if (pending.events.length >= MAX_PENDING_SPAN_EVENTS) {
        pending.dropped += 1;
      } else {
        pending.events.push({
          timeUnixNano: log.timeUnixNano,
          name: record.message,
          attributes: [
            stringAttribute("log.level", record.level),
            ...log.attributes,
          ],
        });
      }
      pendingSpanEvents.set(record.spanId, pending);
    }
  }

  async function postWithRetry(
    path: string,
    dataset: string,
    body: OtlpTracesRequest | OtlpLogsRequest,
  ): Promise<void> {
    const payload = JSON.stringify(body);
    for (let attempt = 1; ; attempt += 1) {
      let response: Response | undefined;
      let failure: string;
      try {
        response = await fetchFn(`${origin}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.token}`,
            "X-Axiom-Dataset": dataset,
          },
          body: payload,
        });
        if (response.ok) {
          return;
        }
        failure = `${response.status} ${await response.text()}`;
      } catch (error) {
        failure = Bun.inspect(error);
      }

      // Client errors will not fix themselves; only server trouble and rate
      // limits are worth another try.
      const retryable =
        response === undefined ||
        response.status === 429 ||
        response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        console.error(
          `Axiom ingest to ${dataset} failed after ${attempt} attempt(s): ${failure}`,
        );
        return;
      }
      await Bun.sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }

  /** Posts everything queued, batch after batch, until the queues are empty. */
  async function drain(): Promise<void> {
    while (spans.length > 0 || logs.length > 0) {
      const spanBatch = spans;
      const logBatch = logs;
      spans = [];
      logs = [];
      const requests: Promise<void>[] = [];
      if (spanBatch.length > 0) {
        requests.push(
          postWithRetry("/v1/traces", options.tracesDataset, {
            resourceSpans: [
              { resource, scopeSpans: [{ scope, spans: spanBatch }] },
            ],
          }),
        );
      }
      if (logBatch.length > 0) {
        requests.push(
          postWithRetry("/v1/logs", options.logsDataset, {
            resourceLogs: [
              { resource, scopeLogs: [{ scope, logRecords: logBatch }] },
            ],
          }),
        );
      }
      await Promise.all(requests);
    }
  }

  /**
   * Starts draining unless a drain is already running; that one picks up
   * anything queued meanwhile. So at most one round of requests is in
   * flight and the bounded queues are the only buffer during an outage.
   */
  function send(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (droppedSpans > 0 || droppedLogs > 0) {
      console.error(
        `Axiom sink dropped ${droppedSpans} spans and ${droppedLogs} logs: queue full`,
      );
      droppedSpans = 0;
      droppedLogs = 0;
    }
    if (draining === undefined) {
      draining = drain().finally(() => {
        draining = undefined;
      });
    }
    return draining;
  }

  return {
    emit: (records) => {
      for (const record of records) {
        accept(record);
      }
      if (spans.length + logs.length >= BATCH_SIZE) {
        void send();
      } else if (timer === undefined && spans.length + logs.length > 0) {
        timer = setTimeout(() => void send(), flushIntervalMs);
      }
    },
    flush: () => send(),
  };
}
