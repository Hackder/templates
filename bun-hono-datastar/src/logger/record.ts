import { z } from "zod/v4";

// The wire format between the logging front end (`src/logger/index.ts`) and
// everything that consumes log records: the worker sinks, the NDJSON file and
// the log viewer in `tools/logview`. Records are plain JSON: Temporal values
// have already been turned into ISO strings, bigints into strings and caught
// errors into `SerializedError` objects.

export const levelSchema = z.enum(["debug", "info", "warn", "error"]);
export type Level = z.infer<typeof levelSchema>;

export const levelOrder = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} satisfies Record<Level, number>;

/**
 * OpenTelemetry span kind. `server` for the span that handles an incoming
 * request, `client` for a call to something outside the process (database,
 * an external API), `internal` for everything else.
 */
export const spanKindSchema = z.enum(["internal", "server", "client"]);
export type SpanKind = z.infer<typeof spanKindSchema>;

/**
 * Application entry point that started a trace, inherited by every span and
 * exported as `trace.origin`. Only entry spans set it (`SpanOptions.origin`);
 * a span inside an existing trace keeps the root's origin. It exists because
 * Axiom cannot group spans by their root in aggregate queries, and one closed,
 * low-cardinality value does that without copying parent fields down (span
 * fields are never inherited) or inferring meaning from span names. A new kind
 * of entry point (a scheduled job, a CLI command) gets its own value here.
 */
export const traceOriginSchema = z.enum(["request"]);
export type TraceOrigin = z.infer<typeof traceOriginSchema>;

export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;

export const jsonFieldsSchema = z.record(z.string(), jsonValueSchema);
export type JsonFields = z.infer<typeof jsonFieldsSchema>;

/** A JSON value that is a plain object, as opposed to a primitive or array. */
export type JsonObject = Record<string, JsonValue>;

export function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

/**
 * A caught error as it is stored in fields, at any depth. The `$error`
 * marker is what tells it apart from a plain object with a name and a
 * message, so consumers never have to guess from key names.
 */
export interface SerializedError {
  $error: true;
  name: string;
  message: string;
  stack?: string;
  cause?: JsonValue;
  /** Member errors of an AggregateError. */
  errors?: JsonValue[];
}

export const serializedErrorSchema: z.ZodType<SerializedError> = z.object({
  $error: z.literal(true),
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  cause: jsonValueSchema.optional(),
  errors: z.array(jsonValueSchema).optional(),
});

export function isSerializedError(
  value: JsonValue,
): value is SerializedError & JsonObject {
  return (
    isJsonObject(value) &&
    value.$error === true &&
    serializedErrorSchema.safeParse(value).success
  );
}

/** An error found in a record's fields, by its dotted path (`api.err`). */
export interface NamedError {
  key: string;
  error: SerializedError;
}

export interface SplitFields {
  fields: JsonFields;
  errors: NamedError[];
}

/**
 * Splits a record's fields into plain fields and the serialized errors found
 * in them, at any object depth, so a consumer can render errors as blocks and
 * ship them as exceptions instead of treating them as nested JSON. Errors
 * inside arrays stay where they are (their position is their identity), but
 * still count for `hasErrorValue`.
 */
export function splitErrorFields(fields: JsonFields): SplitFields {
  const errors: NamedError[] = [];
  function walk(object: JsonFields, prefix: string): JsonFields {
    const plain: JsonFields = {};
    for (const [key, value] of Object.entries(object)) {
      const path = `${prefix}${key}`;
      if (isSerializedError(value)) {
        errors.push({ key: path, error: value });
      } else if (isJsonObject(value)) {
        plain[key] = walk(value, `${path}.`);
      } else {
        plain[key] = value;
      }
    }
    return plain;
  }
  return { fields: walk(fields, ""), errors };
}

/** Whether a serialized error sits anywhere in the fields. */
export function hasErrorValue(fields: JsonFields): boolean {
  return Object.values(fields).some(containsError);
}

function containsError(value: JsonValue): boolean {
  if (isSerializedError(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsError);
  }
  if (isJsonObject(value)) {
    return Object.values(value).some(containsError);
  }
  return false;
}

export const countersSchema = z.record(z.string(), z.number());
export type CountersJson = z.infer<typeof countersSchema>;

const spanRecordBase = {
  /** Wall-clock time, ms since epoch. */
  time: z.number(),
  name: z.string(),
  spanKind: spanKindSchema,
  /** Owning spans log a canonical line on close; sections close at debug. */
  owning: z.boolean(),
  /** 32 lowercase hex chars, shared by every span and event of one trace. */
  traceId: z.string(),
  /** 16 lowercase hex chars. */
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  traceOrigin: traceOriginSchema.optional(),
  fields: jsonFieldsSchema,
};

export const logRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event"),
    level: levelSchema,
    time: z.number(),
    message: z.string(),
    fields: jsonFieldsSchema,
    /** Set when logged inside a span. */
    traceId: z.string().optional(),
    /** Innermost enclosing span. */
    spanId: z.string().optional(),
    /**
     * Warnings and errors only: the enclosing spans' fields as they were
     * when the event fired, outermost span first, so the reader gets the
     * whole picture without waiting for the spans to close.
     */
    context: jsonFieldsSchema.optional(),
  }),
  z.object({
    kind: z.literal("spanOpen"),
    ...spanRecordBase,
  }),
  z.object({
    kind: z.literal("spanClose"),
    ...spanRecordBase,
    level: levelSchema,
    /** Wall-clock start, ms since epoch; `time` is the close. */
    startTime: z.number(),
    durationMs: z.number(),
    counters: countersSchema,
  }),
]);

export type LogRecord = z.infer<typeof logRecordSchema>;
export type EventRecord = Extract<LogRecord, { kind: "event" }>;
export type SpanOpenRecord = Extract<LogRecord, { kind: "spanOpen" }>;
export type SpanCloseRecord = Extract<LogRecord, { kind: "spanClose" }>;

/**
 * Messages the front end posts to the logging worker. Plain objects with
 * primitive values only: Bun clones those on a fast path, and one string per
 * batch is far cheaper than cloning every record.
 */
export type WorkerRequest =
  | {
      type: "records";
      /** Newline-separated JSON records. */
      lines: string;
    }
  | { type: "flush"; id: number };

export type WorkerResponse =
  /** One batch of records has been handed to every sink. */
  { type: "processed" } | { type: "flushed"; id: number };
