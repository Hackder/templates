import { AsyncLocalStorage } from "node:async_hooks";
import { DrizzleQueryError } from "drizzle-orm";
import { env } from "../env";
import { jsonParse } from "../std";
import { type ConsoleFormatterOptions, createConsoleFormatter } from "./format";
import {
  type CountersJson,
  hasErrorValue,
  type JsonFields,
  type JsonValue,
  type Level,
  levelOrder,
  type LogRecord,
  logRecordSchema,
  type SpanKind,
  type TraceOrigin,
  type WorkerRequest,
  type WorkerResponse,
} from "./record";

export type {
  Level,
  LogRecord,
  SerializedError,
  SpanKind,
  TraceOrigin,
} from "./record";

// Structured logging and tracing in one. Two kinds of spans:
//
// - `withSpan` creates an *owning* span: the target for `logger().set()` and
//   it automatically logs one canonical line when it closes, carrying its
//   accumulated fields, counters and duration.
// - `withSection` creates a *transparent* span: it shows up in the span path
//   of events logged inside it. Counters roll up through it, but it is not a
//   `set()` target and closes silently (a debug line).
//
// Both are real spans on the wire (and in Axiom); the difference is only
// where `set()` lands and how loud the close line is.
//
// Events (`logger().info(...)` etc.) fire immediately. A caught error goes
// under the `err` key, or any key ending in `Err` (`apiErr`, `dbErr`), of the
// fields of an event or of `set()`. It is serialized right there (message,
// stack, cause chain), so a request's canonical line can carry every error
// that happened during it, by name, and errors are never swallowed.
//
// The calling thread only builds a small JSON record per event and queues it;
// formatting, file writes and shipping to Axiom happen in `worker.ts`.

// Everything we consider loggable. Not pure JSON on purpose: Temporal values
// and Errors are first-class citizens in this codebase and are turned into
// JSON at the call site. Extend this union when a new kind of value needs
// logging.
export type LogValue =
  | Error
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.PlainTime
  | Temporal.PlainYearMonth
  | Temporal.Duration
  | readonly LogValue[]
  | { readonly [key: string]: LogValue };

/**
 * The closed set of counter names, so a typo cannot silently start a new
 * counter. Extend the union when a new counter is needed.
 */
export type CounterName = "dbQueries" | "dbRows";

// --- Values -> JSON ----------------------------------------------------------

// Listed explicitly: the classes are non-enumerable on the Temporal namespace.
const temporalClasses = [
  Temporal.Instant,
  Temporal.ZonedDateTime,
  Temporal.PlainDate,
  Temporal.PlainDateTime,
  Temporal.PlainTime,
  Temporal.PlainYearMonth,
  Temporal.Duration,
];

type TemporalLogValue =
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.PlainTime
  | Temporal.PlainYearMonth
  | Temporal.Duration;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serialization boundary
function isTemporalValue(value: unknown): value is TemporalLogValue {
  return temporalClasses.some((cls) => value instanceof cls);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serialization boundary
function isJsonPrimitive(value: unknown): value is string | number | boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- serialization boundary
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean";
}

// Past this depth the rest is kept as inspected text. It bounds the walk for
// pathological values (cycles, very deep trees), which `Bun.inspect` renders
// without recursing forever.
const MAX_DEPTH = 16;

/**
 * The one serialization boundary: turns whatever was logged into plain JSON.
 * Errors, at any depth, become a `SerializedError` (marker, message, stack,
 * cause chain, aggregate members); Temporal values their ISO string; bigints
 * a decimal string; arrays and plain objects are walked; `undefined` is
 * dropped from objects and becomes `null` in arrays. Anything else (class
 * instances, functions) is kept as its inspected text so nothing is lost.
 *
 * Takes `unknown` on purpose: `EventFields` types the call site, and caught
 * values are `unknown` by nature.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the serialization boundary
export function toJsonValue(value: unknown, depth = 0): JsonValue | undefined {
  if (value === undefined || value === null || isJsonPrimitive(value)) {
    return value;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- serialization boundary
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (isTemporalValue(value)) {
    return value.toString();
  }
  if (depth >= MAX_DEPTH) {
    return Bun.inspect(value);
  }
  if (value instanceof Error) {
    return errorToJson(value, depth);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry, depth + 1) ?? null);
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    // SAFETY: a plain object; the walker treats each value as unknown anyway,
    // the annotation only names the shape callers are allowed to log.
    return toJsonFields(value as Record<string, LogValue>, depth + 1);
  }
  return Bun.inspect(value);
}

/**
 * Drizzle puts the query's bound values into the message ("params: …"), and
 * the stack repeats the message. Those values can be credentials (a token or
 * a password hash being saved), so a failed query is logged with its SQL only.
 */
function redactedMessageAndStack(error: Error) {
  if (!(error instanceof DrizzleQueryError)) {
    return { message: error.message, stack: error.stack };
  }
  const message = `Failed query: ${error.query}`;
  const stack = error.stack?.replace(error.message, message);
  return {
    message,
    stack: stack?.includes("params:") === true ? undefined : stack,
  };
}

function errorToJson(error: Error, depth: number): JsonValue {
  const { message, stack } = redactedMessageAndStack(error);
  const entries: [string, JsonValue][] = [
    ["$error", true],
    ["name", error.name],
    ["message", message],
  ];
  if (stack !== undefined) {
    entries.push(["stack", stack]);
  }
  if (error.cause !== undefined) {
    entries.push(["cause", toJsonValue(error.cause, depth + 1) ?? null]);
  }
  if (error instanceof AggregateError) {
    entries.push([
      "errors",
      error.errors.map((member) => toJsonValue(member, depth + 1) ?? null),
    ]);
  }
  return Object.fromEntries(entries);
}

/**
 * Fields as written at a call site: every value must be a `LogValue`, except
 * error keys (`err`, or anything ending in `Err`), which accept whatever was
 * caught (`unknown`). The name is only a typing convenience for `catch`
 * blocks; serialization recognises errors by what they are, not by key.
 *
 * The generic indirection exists because an index signature cannot carve out
 * differently-typed keys by name; constraining the call site's own shape can.
 * The `object &` on every use keeps primitives out: a homomorphic mapped type
 * over a primitive is the primitive itself, so `EventFields<undefined>` would
 * otherwise be satisfied by `undefined`.
 */
export type EventFields<T> = {
  [K in keyof T]: K extends "err"
    ? unknown
    : K extends `${string}Err`
      ? unknown
      : LogValue;
};

/** Turns call-site fields into wire fields. */
export function toJsonFields<T extends object & EventFields<T>>(
  fields: T,
  depth = 0,
): JsonFields {
  const out: JsonFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const json = toJsonValue(value, depth);
    if (json !== undefined) {
      out[key] = json;
    }
  }
  return out;
}

// --- Spans -------------------------------------------------------------------

interface Span {
  id: string;
  traceId: string;
  parent: Span | undefined;
  name: string;
  spanKind: SpanKind;
  traceOrigin: TraceOrigin | undefined;
  kind: "owning" | "transparent";
  fields: JsonFields;
  counters: Map<CounterName, number>;
  /** Epoch timestamp derived from the monotonic clock. */
  startTime: number;
}

const spanStorage = new AsyncLocalStorage<Span>();

function now(): number {
  return performance.timeOrigin + performance.now();
}

// Trace and span ids follow the W3C / OpenTelemetry sizes (16 and 8 random
// bytes, lowercase hex), so they can be shipped as they are.
const idBytes = new Uint8Array(16);

function randomHex(byteLength: number): string {
  const bytes = idBytes.subarray(0, byteLength);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

function newTraceId(): string {
  return randomHex(16);
}

function newSpanId(): string {
  return randomHex(8);
}

// --- Transports --------------------------------------------------------------

export interface Transport {
  emit: (record: LogRecord) => void;
  /** Resolves once everything emitted so far has been written or shipped. */
  flush?: () => Promise<void>;
}

function defaultTransports(): Transport[] {
  if (env.NODE_ENV === "test") {
    return [];
  }
  return [workerTransport()];
}

let transports: Transport[] = defaultTransports();

export function setTransports(next: Transport[]): void {
  transports = next;
}

/** Waits for every transport to write or ship what it has buffered. */
export async function flushLogger(): Promise<void> {
  await Promise.all(
    transports.flatMap((transport) =>
      transport.flush === undefined ? [] : [transport.flush()],
    ),
  );
}

const shutdownTasks: (() => void | Promise<void>)[] = [];
let signalsHandled = false;

/**
 * On SIGTERM or SIGINT: run the shutdown tasks in order, flush the logs
 * (so the tasks' own lines are kept), then exit.
 */
function handleSignals(): void {
  if (signalsHandled) {
    return;
  }
  signalsHandled = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void (async () => {
        for (const task of shutdownTasks) {
          try {
            await task();
          } catch (error) {
            logger().error("Shutdown task failed", { err: error });
          }
        }
        await flushLogger();
        process.exit(signal === "SIGINT" ? 130 : 0);
      })();
    });
  }
}

/**
 * Runs `task` on SIGTERM or SIGINT before the process exits, e.g. to close
 * the database.
 */
export function onShutdown(task: () => void | Promise<void>): void {
  shutdownTasks.push(task);
  handleSignals();
}

function emit(record: LogRecord): void {
  for (const transport of transports) {
    try {
      transport.emit(record);
    } catch (error) {
      // Logging must never take the caller down; the failure is still loud.
      console.error("Logger transport failed", error);
    }
  }
}

function logEvent(level: Level, message: string, fields: JsonFields): void {
  const current = spanStorage.getStore();
  const record: LogRecord = {
    kind: "event",
    level,
    time: now(),
    message,
    fields,
  };
  if (current !== undefined) {
    record.traceId = current.traceId;
    record.spanId = current.id;
    // Only warnings and errors pay for the snapshot; they are rare and are
    // exactly the lines whose surroundings a reader needs.
    if (levelOrder[level] >= levelOrder.warn) {
      record.context = spanContext(current);
    }
  }
  emit(record);
}

/** The fields of every enclosing span, outermost first, inner keys winning. */
function spanContext(innermost: Span): JsonFields {
  const chain: Span[] = [];
  for (let s: Span | undefined = innermost; s !== undefined; s = s.parent) {
    chain.unshift(s);
  }
  const context: JsonFields = {};
  for (const span of chain) {
    Object.assign(context, span.fields);
  }
  return context;
}

/** Logs at one level. Put a caught error under `err` or a `*Err` key. */
export type LogFn = <T extends object & EventFields<T>>(
  message: string,
  fields?: T,
) => void;

function logFn(level: Level): LogFn {
  return (message, fields) => {
    logEvent(level, message, fields === undefined ? {} : toJsonFields(fields));
  };
}

function nearestOwning(from: Span | undefined): Span | undefined {
  for (let s = from; s !== undefined; s = s.parent) {
    if (s.kind === "owning") {
      return s;
    }
  }
  return undefined;
}

function setFields(from: Span | undefined, fields: JsonFields): void {
  const target = nearestOwning(from);
  if (target === undefined) {
    logEvent(
      "warn",
      "logger().set() called with no owning span, fields dropped",
      fields,
    );
    return;
  }

  mergeFields(target, fields);
}

/**
 * Adds fields to a span without losing anything: a key that is already set
 * keeps its value and the new one lands under the first free numeric suffix
 * (`apiErr`, `apiErr2`, ...).
 */
function mergeFields(target: Span, fields: JsonFields): void {
  for (const [key, value] of Object.entries(fields)) {
    let currentKey = key;
    let counter = 2;
    while (currentKey in target.fields) {
      currentKey = `${key}${counter}`;
      counter += 1;
    }
    target.fields[currentKey] = value;
  }
}

function setFieldsOnce(from: Span | undefined, fields: JsonFields): boolean {
  const target = nearestOwning(from);
  if (target === undefined) {
    logEvent(
      "warn",
      "logger().setOnce() called with no owning span, fields dropped",
      fields,
    );
    return false;
  }

  const entries = Object.entries(fields);
  if (entries.some(([key]) => key in target.fields)) {
    return false;
  }
  for (const [key, value] of entries) {
    target.fields[key] = value;
  }
  return true;
}

function addCounter(
  from: Span | undefined,
  name: CounterName,
  amount: number,
): void {
  let counted = false;
  for (let s = from; s !== undefined; s = s.parent) {
    s.counters.set(name, (s.counters.get(name) ?? 0) + amount);
    counted = true;
  }
  if (!counted) {
    logEvent(
      "warn",
      "logger().addCounter() called with no span, count dropped",
      {
        counter: name,
        amount,
      },
    );
  }
}

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  /**
   * Sets fields on the nearest owning span; they appear on its close line.
   * A key that is already set is kept and the new value lands under the key
   * with a numeric suffix (`apiErr`, `apiErr2`, ...), so nothing is lost.
   */
  set: <T extends object & EventFields<T>>(fields: T) => void;
  /**
   * Sets fields only while the span carries none of their keys, and reports
   * whether it did. For instrumentation that fires several times in one
   * request while describing a single thing — a cached value read by three
   * components of the same page is one cache read — so that the repeats
   * neither suffix the field nor count again.
   */
  setOnce: <T extends object & EventFields<T>>(fields: T) => boolean;
  /** Adds to a counter on every span up the stack; totals roll up automatically. */
  addCounter: (name: CounterName, amount?: number) => void;
}

const loggerFacade: Logger = {
  debug: logFn("debug"),
  info: logFn("info"),
  warn: logFn("warn"),
  error: logFn("error"),
  set: (fields) => setFields(spanStorage.getStore(), toJsonFields(fields)),
  setOnce: (fields) =>
    setFieldsOnce(spanStorage.getStore(), toJsonFields(fields)),
  addCounter: (name, amount = 1) =>
    addCounter(spanStorage.getStore(), name, amount),
};

export function logger(): Logger {
  return loggerFacade;
}

/**
 * Whether an owning span is active in the current async context. For
 * instrumentation that fires on every operation (e.g. the db query counter)
 * and must stay silent outside spans instead of warn-dropping.
 */
export function hasOwningSpan(): boolean {
  return nearestOwning(spanStorage.getStore()) !== undefined;
}

export interface SpanHandle {
  /** Sets fields on exactly this span, even a transparent one. */
  set: <F extends object & EventFields<F>>(fields: F) => void;
  /** Adds to a counter on this span and every ancestor. */
  addCounter: (name: CounterName, amount?: number) => void;
}

export interface SpanOptions {
  /** OpenTelemetry span kind; `internal` when omitted. */
  kind?: SpanKind;
  /** Origin to use if this span starts a new trace. */
  origin?: TraceOrigin;
}

/**
 * Owning span: `set()`/`addCounter()` target, logs a canonical line with its
 * accumulated fields and duration when it closes. Errors thrown inside close
 * the span, land on its close line and are re-thrown.
 */
export function withSpan<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  fn: (span: SpanHandle) => T,
): T;
export function withSpan<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  options: SpanOptions,
  fn: (span: SpanHandle) => T,
): T;
export function withSpan<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  ...optionsAndFn:
    | [fn: (span: SpanHandle) => T]
    | [options: SpanOptions, fn: (span: SpanHandle) => T]
): T {
  if (optionsAndFn.length === 1) {
    return runSpan("owning", name, toJsonFields(fields), optionsAndFn[0], {});
  }
  const [options, fn] = optionsAndFn;
  return runSpan("owning", name, toJsonFields(fields), fn, options);
}

/** Transparent span: names a section for timing and event context only. */
export function withSection<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  fn: (span: SpanHandle) => T,
): T;
export function withSection<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  options: SpanOptions,
  fn: (span: SpanHandle) => T,
): T;
export function withSection<T, F extends object & EventFields<F>>(
  name: string,
  fields: F,
  ...optionsAndFn:
    | [fn: (span: SpanHandle) => T]
    | [options: SpanOptions, fn: (span: SpanHandle) => T]
): T {
  if (optionsAndFn.length === 1) {
    return runSpan(
      "transparent",
      name,
      toJsonFields(fields),
      optionsAndFn[0],
      {},
    );
  }
  const [options, fn] = optionsAndFn;
  return runSpan("transparent", name, toJsonFields(fields), fn, options);
}

function runSpan<T>(
  kind: Span["kind"],
  name: string,
  fields: JsonFields,
  fn: (span: SpanHandle) => T,
  options: SpanOptions,
): T {
  const parent = spanStorage.getStore();
  const startTime = now();
  const span: Span = {
    id: newSpanId(),
    traceId: parent?.traceId ?? newTraceId(),
    parent,
    name,
    spanKind: options.kind ?? "internal",
    traceOrigin: parent === undefined ? options.origin : parent.traceOrigin,
    kind,
    fields: { ...fields },
    counters: new Map(),
    startTime,
  };

  const handle: SpanHandle = {
    set: (f) => {
      mergeFields(span, toJsonFields(f));
    },
    addCounter: (counterName, amount = 1) =>
      addCounter(span, counterName, amount),
  };

  const open: LogRecord = {
    kind: "spanOpen",
    time: startTime,
    name,
    spanKind: span.spanKind,
    owning: kind === "owning",
    traceId: span.traceId,
    spanId: span.id,
    fields: { ...fields },
  };
  if (parent !== undefined) {
    open.parentSpanId = parent.id;
  }
  if (span.traceOrigin !== undefined) {
    open.traceOrigin = span.traceOrigin;
  }
  emit(open);

  let result: T;
  try {
    result = spanStorage.run(span, () => fn(handle));
  } catch (error) {
    closeSpan(span, { threw: true, error });
    throw error;
  }

  if (result instanceof Promise) {
    // SAFETY: `result` is both `T` and a promise; re-wrapping its settled
    // value in a same-shaped promise keeps the visible type `T`.
    return (result as Promise<unknown>).then(
      (value) => {
        closeSpan(span, { threw: false });
        return value;
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- thrown values are unknown
      (error: unknown) => {
        closeSpan(span, { threw: true, error });
        throw error;
      },
    ) as T;
  }

  closeSpan(span, { threw: false });
  return result;
}

// Explicit, because `undefined` is a legal thing to throw.
type SpanOutcome = { threw: false } | { threw: true; error: unknown };

function closeSpan(span: Span, outcome: SpanOutcome): void {
  const endTime = now();
  const durationMs = endTime - span.startTime;

  const fields = { ...span.fields };
  if (outcome.threw) {
    // Whatever was thrown is recorded as an error, so the close line reads
    // as one even for `throw "string"` and friends.
    fields.uncaughtErr = errorToJson(
      outcome.error instanceof Error
        ? outcome.error
        : new Error("Non-Error value thrown", { cause: outcome.error }),
      0,
    );
  }

  let level: Level = span.kind === "owning" ? "info" : "debug";
  if (hasErrorValue(fields)) {
    level = "error";
  }

  const counters: CountersJson = {};
  for (const [name, amount] of span.counters) {
    counters[name] = amount;
  }

  const record: LogRecord = {
    kind: "spanClose",
    time: endTime,
    name: span.name,
    spanKind: span.spanKind,
    owning: span.kind === "owning",
    traceId: span.traceId,
    spanId: span.id,
    fields,
    level,
    startTime: span.startTime,
    durationMs,
    counters,
  };
  if (span.parent !== undefined) {
    record.parentSpanId = span.parent.id;
  }
  if (span.traceOrigin !== undefined) {
    record.traceOrigin = span.traceOrigin;
  }
  emit(record);
}

// --- Worker transport --------------------------------------------------------

// Records are queued as JSON lines and handed to the worker in batches: one
// string per batch takes Bun's no-copy path through postMessage, and the
// worker does every slow thing (formatting, file appends, HTTP to Axiom).
const WORKER_BATCH_SIZE = 500;
const WORKER_BATCH_DELAY_MS = 20;
const WORKER_FLUSH_TIMEOUT_MS = 3000;
// Bounded so a stalled worker cannot grow the heap without limit; the drop
// is counted and reported once the worker catches up.
const WORKER_MAX_PENDING = 20_000;
// A worker that keeps dying (a sink that throws at startup, say) is not
// restarted forever; after this many exits the app thread formats to the
// console itself so nothing is lost silently.
const WORKER_MAX_RESTARTS = 3;
// Batches posted but not yet confirmed by the worker. Past this, records wait
// on the app side (bounded by WORKER_MAX_PENDING) instead of piling up in the
// worker's message queue.
const WORKER_MAX_UNACKED_BATCHES = 40;

export function workerTransport(): Transport {
  let worker: Worker | undefined;
  let restarts = 0;
  let fallback: Transport | undefined;
  let pending: string[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextFlushId = 1;
  const flushWaiters = new Map<number, () => void>();
  // Something was emitted that the worker has not confirmed as handled yet.
  let dirty = false;
  // A batch was posted after the last flush marker, so that marker's answer
  // does not cover it.
  let postedSinceMarker = false;
  let unackedBatches = 0;

  function ensureWorker(): Worker | undefined {
    if (worker !== undefined || fallback !== undefined) {
      return worker;
    }
    if (restarts > WORKER_MAX_RESTARTS) {
      console.error(
        "Logger worker keeps exiting, logging to the console from the app thread instead",
      );
      fallback = consoleTransport({ level: env.LOG_LEVEL });
      return undefined;
    }
    restarts += 1;
    // The worker must not keep the process alive on its own (`ref: false`);
    // the shutdown hooks below flush it before the process ends.
    const spawned = new Worker(new URL("./worker.ts", import.meta.url).href, {
      ref: false,
    });
    worker = spawned;
    spawned.onmessage = (message: MessageEvent<WorkerResponse>) => {
      const response = message.data;
      if (response.type === "processed") {
        unackedBatches = Math.max(0, unackedBatches - 1);
        // Records held back by the bound go out now that there is room.
        if (pending.length > 0 && timer === undefined) {
          timer = setTimeout(sendPending, WORKER_BATCH_DELAY_MS);
        }
        return;
      }
      const waiter = flushWaiters.get(response.id);
      if (waiter !== undefined) {
        flushWaiters.delete(response.id);
        waiter();
      }
    };
    spawned.onerror = (event) => {
      console.error("Logger worker failed", event.message);
    };
    spawned.addEventListener("close", () => {
      // The next batch spawns a fresh one; whatever the dead worker had not
      // written is gone, which the outstanding flushes learn by timing out.
      if (worker === spawned) {
        worker = undefined;
        unackedBatches = 0;
      }
    });
    installShutdownHooks();
    return spawned;
  }

  /** Posts to the worker; false when there is none (fallback mode). */
  function post(request: WorkerRequest): boolean {
    const target = ensureWorker();
    if (target === undefined) {
      return false;
    }
    try {
      target.postMessage(request);
      return true;
    } catch (error) {
      console.error("Logger worker unreachable, records lost", error);
      return false;
    }
  }

  /** The records queued for the worker, handed to the fallback instead. */
  function replayIntoFallback(lines: string[]): void {
    if (fallback === undefined) {
      return;
    }
    for (const line of lines) {
      const json = jsonParse(line);
      const parsed = json.ok
        ? logRecordSchema.safeParse(json.value)
        : undefined;
      if (parsed?.success === true) {
        fallback.emit(parsed.data);
      }
    }
  }

  function sendPending(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (dropped > 0) {
      const record: LogRecord = {
        kind: "event",
        level: "warn",
        time: now(),
        message: "Logger dropped records: worker could not keep up",
        fields: { dropped },
      };
      pending.push(JSON.stringify(record));
      dropped = 0;
    }
    if (pending.length === 0) {
      return;
    }
    if (unackedBatches >= WORKER_MAX_UNACKED_BATCHES) {
      // The worker is behind; keep the records here until it acknowledges a
      // batch, which reschedules this.
      return;
    }
    const batch = pending;
    pending = [];
    postedSinceMarker = true;
    unackedBatches += 1;
    if (!post({ type: "records", lines: batch.join("\n") })) {
      unackedBatches -= 1;
      replayIntoFallback(batch);
    }
  }

  function flush(): Promise<void> {
    sendPending();
    if (worker === undefined) {
      // Nothing is in flight: no worker was ever needed, it died, or the
      // fallback writes synchronously.
      dirty = false;
      return Promise.resolve();
    }
    const id = nextFlushId++;
    postedSinceMarker = false;
    return new Promise<void>((resolve) => {
      // Also what keeps the event loop alive while waiting: the worker is
      // unref'd, so its answer alone would not.
      const timeout = setTimeout(() => {
        flushWaiters.delete(id);
        console.error("Logger flush timed out, some records may be lost");
        settle();
      }, WORKER_FLUSH_TIMEOUT_MS);
      function settle(): void {
        clearTimeout(timeout);
        // Anything emitted or posted since the marker is still unconfirmed.
        if (pending.length === 0 && !postedSinceMarker) {
          dirty = false;
        }
        resolve();
      }
      flushWaiters.set(id, settle);
      post({ type: "flush", id });
    });
  }

  let hooksInstalled = false;
  function installShutdownHooks(): void {
    if (hooksInstalled) {
      return;
    }
    hooksInstalled = true;

    // The event loop drained (a script finished): flush, which keeps the loop
    // alive until the worker answers. `beforeExit` fires again after that and
    // finds nothing dirty, so the process ends.
    process.on("beforeExit", () => {
      if (dirty) {
        void flush();
      }
    });

    handleSignals();
  }

  return {
    emit: (record) => {
      if (fallback !== undefined) {
        fallback.emit(record);
        return;
      }
      dirty = true;
      if (pending.length >= WORKER_MAX_PENDING) {
        dropped += 1;
        return;
      }
      pending.push(JSON.stringify(record));
      if (pending.length >= WORKER_BATCH_SIZE) {
        sendPending();
      } else if (timer === undefined) {
        timer = setTimeout(sendPending, WORKER_BATCH_DELAY_MS);
      }
    },
    flush,
  };
}

// --- Console transport (in-process) ------------------------------------------

/**
 * Formats records on the calling thread. The app itself logs through the
 * worker; this is for tools that must keep their own logging simple (the log
 * viewer) and for tests of the formatter.
 */
export function consoleTransport(options: ConsoleFormatterOptions): Transport {
  const formatter = createConsoleFormatter(options);
  return {
    emit: (record) => {
      const line = formatter.format(record);
      if (line !== undefined) {
        console.log(line);
      }
    },
  };
}

// --- Memory transport (tests) ------------------------------------------------

export type MemoryTransport = Transport & { records: LogRecord[] };

export function memoryTransport(): MemoryTransport {
  const records: LogRecord[] = [];
  return {
    records,
    emit: (record) => {
      records.push(record);
    },
  };
}
