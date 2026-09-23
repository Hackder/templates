import { exhaustiveCheck } from "../../src/utils";
import { jsonParse } from "../../src/std";
import {
  type CountersJson,
  type JsonFields,
  type Level,
  type LogRecord,
  logRecordSchema,
  type NamedError,
  splitErrorFields,
} from "../../src/logger/record";

// The viewer's in-memory model: NDJSON lines from the app's
// `jsonFileTransport` parsed back into traces of span trees plus their
// events. Everything here is plain data derived from the file; the UI renders
// straight from it.

// --- Wire format -------------------------------------------------------------
// The NDJSON file holds `LogRecord`s from src/logger/record.ts, one per line.

export {
  type CountersJson,
  isSerializedError,
  type JsonFields,
  type JsonValue,
  type Level,
  levelOrder,
  type NamedError,
  type SerializedError as ErrorJson,
  splitErrorFields,
} from "../../src/logger/record";

// --- Trace model -------------------------------------------------------------

export interface TraceEvent {
  seq: number;
  time: number;
  level: Level;
  message: string;
  fields: JsonFields;
  /** Span names, outermost first. */
  spanPath: string[];
  /** Span ids, outermost first, for subtree membership checks. */
  spanIds: string[];
  /** Innermost enclosing span, if any. */
  spanId: string | undefined;
  /** Serialized errors pulled out of the fields, in field order. */
  errors: NamedError[];
}

export interface SpanNode {
  id: string;
  parentId: string | undefined;
  name: string;
  owning: boolean;
  depth: number;
  fields: JsonFields;
  /** Wall-clock ms since epoch. */
  startTime: number;
  /** Set when the span closes; running spans have none. */
  durationMs: number | undefined;
  closed: boolean;
  level: Level;
  /** Serialized errors pulled out of the fields, in field order. */
  errors: NamedError[];
  counters: CountersJson;
  children: SpanNode[];
  events: TraceEvent[];
}

export interface Trace {
  id: string;
  /** Arrival order, for stable sorting. */
  seq: number;
  rootName: string;
  startTime: number;
  /** Latest span close time seen so far. */
  endTime: number | undefined;
  openCount: number;
  errorCount: number;
  warnCount: number;
  eventCount: number;
  maxDepth: number;
  roots: SpanNode[];
  spans: Map<string, SpanNode>;
  events: TraceEvent[];
}

export interface Store {
  /** Insertion-ordered by trace arrival; oldest evicted first. */
  traces: Map<string, Trace>;
  /** Events logged outside any span. */
  orphanEvents: TraceEvent[];
  totalLines: number;
  parseErrors: number;
  droppedTraces: number;
}

export function createStore(): Store {
  return {
    traces: new Map(),
    orphanEvents: [],
    totalLines: 0,
    parseErrors: 0,
    droppedTraces: 0,
  };
}

const MAX_TRACES = 200;
const MAX_TRACE_EVENTS = 2000;
const MAX_SPAN_EVENTS = 500;
const MAX_ORPHAN_EVENTS = 500;

let nextSeq = 0;

function ensureTrace(store: Store, traceId: string, time: number): Trace {
  let trace = store.traces.get(traceId);
  if (trace !== undefined) {
    return trace;
  }
  trace = {
    id: traceId,
    seq: nextSeq++,
    rootName: "?",
    startTime: time,
    endTime: undefined,
    openCount: 0,
    errorCount: 0,
    warnCount: 0,
    eventCount: 0,
    maxDepth: 0,
    roots: [],
    spans: new Map(),
    events: [],
  };
  store.traces.set(traceId, trace);
  while (store.traces.size > MAX_TRACES) {
    const oldest = store.traces.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    store.traces.delete(oldest);
    store.droppedTraces += 1;
  }
  return trace;
}

function newSpan(
  trace: Trace,
  info: { id: string; name: string; owning: boolean; fields: JsonFields },
  parent: SpanNode | undefined,
  time: number,
): SpanNode {
  const { fields, errors } = splitErrorFields(info.fields);
  const node: SpanNode = {
    id: info.id,
    parentId: parent?.id,
    name: info.name,
    owning: info.owning,
    depth: parent === undefined ? 0 : parent.depth + 1,
    fields,
    startTime: time,
    durationMs: undefined,
    closed: false,
    level: "info",
    errors,
    counters: {},
    children: [],
    events: [],
  };
  trace.spans.set(node.id, node);
  if (parent === undefined) {
    trace.roots.push(node);
  } else {
    parent.children.push(node);
  }
  trace.maxDepth = Math.max(trace.maxDepth, node.depth);
  return node;
}

/** The span a record names as its parent, if the store has seen it open. */
function parentOf(
  spans: ReadonlyMap<string, SpanNode>,
  parentSpanId: string | undefined,
): SpanNode | undefined {
  return parentSpanId === undefined ? undefined : spans.get(parentSpanId);
}

function toTraceEvent(
  spans: ReadonlyMap<string, SpanNode>,
  line: Extract<LogRecord, { kind: "event" }>,
): TraceEvent {
  const { fields, errors } = splitErrorFields(line.fields);
  // Enclosing spans, outermost first; empty when the span is unknown (the
  // trace was evicted or the file was truncated mid-trace).
  const chain: SpanNode[] = [];
  for (
    let s = parentOf(spans, line.spanId);
    s !== undefined;
    s = parentOf(spans, s.parentId)
  ) {
    chain.unshift(s);
  }
  return {
    seq: nextSeq++,
    time: line.time,
    level: line.level,
    message: line.message,
    fields,
    spanPath: chain.map((s) => s.name),
    spanIds: chain.map((s) => s.id),
    spanId: chain.at(-1)?.id,
    errors,
  };
}

function capPush<T>(list: T[], item: T, cap: number): void {
  list.push(item);
  if (list.length > cap) {
    list.splice(0, list.length - cap);
  }
}

export function applyLine(store: Store, rawLine: string): Error | undefined {
  store.totalLines += 1;

  const json = jsonParse(rawLine);
  if (!json.ok) {
    store.parseErrors += 1;
    return json.error;
  }

  const parsed = logRecordSchema.safeParse(json.value);
  if (!parsed.success) {
    store.parseErrors += 1;
    return parsed.error;
  }
  const line = parsed.data;

  switch (line.kind) {
    case "event": {
      if (line.traceId === undefined) {
        capPush(
          store.orphanEvents,
          toTraceEvent(new Map(), line),
          MAX_ORPHAN_EVENTS,
        );
        return;
      }
      const trace = ensureTrace(store, line.traceId, line.time);
      const event = toTraceEvent(trace.spans, line);
      trace.eventCount += 1;
      if (line.level === "error") {
        trace.errorCount += 1;
      } else if (line.level === "warn") {
        trace.warnCount += 1;
      }
      capPush(trace.events, event, MAX_TRACE_EVENTS);
      const span = parentOf(trace.spans, event.spanId);
      if (span !== undefined) {
        capPush(span.events, event, MAX_SPAN_EVENTS);
      }
      break;
    }
    case "spanOpen": {
      const trace = ensureTrace(store, line.traceId, line.time);
      if (trace.spans.has(line.spanId)) {
        return;
      }
      const parent = parentOf(trace.spans, line.parentSpanId);
      newSpan(
        trace,
        {
          id: line.spanId,
          name: line.name,
          owning: line.owning,
          fields: line.fields,
        },
        parent,
        line.time,
      );
      trace.openCount += 1;
      if (parent === undefined && trace.rootName === "?") {
        trace.rootName = line.name;
        trace.startTime = line.time;
      }
      break;
    }
    case "spanClose": {
      const trace = ensureTrace(store, line.traceId, line.startTime);
      let span = trace.spans.get(line.spanId);
      if (span === undefined) {
        // No open line seen (file truncated mid-trace): materialize from the
        // close, which carries everything but the start.
        span = newSpan(
          trace,
          {
            id: line.spanId,
            name: line.name,
            owning: line.owning,
            fields: line.fields,
          },
          parentOf(trace.spans, line.parentSpanId),
          line.startTime,
        );
        trace.openCount += 1;
        if (span.parentId === undefined && trace.rootName === "?") {
          trace.rootName = line.name;
          trace.startTime = line.startTime;
        }
      }
      trace.openCount -= 1;
      span.closed = true;
      // The close line carries the final accumulated fields and counters.
      const { fields, errors } = splitErrorFields(line.fields);
      span.fields = fields;
      span.errors = errors;
      span.durationMs = line.durationMs;
      span.level = line.level;
      span.counters = line.counters;
      trace.endTime = Math.max(trace.endTime ?? 0, line.time);
      if (errors.length > 0) {
        trace.errorCount += 1;
      }
      break;
    }
    default:
      exhaustiveCheck(line);
  }
  return undefined;
}

/** End of a span bar for rendering: close time, or "now" while running. */
export function spanEnd(span: SpanNode, now: number): number {
  if (span.durationMs !== undefined) {
    return span.startTime + span.durationMs;
  }
  return Math.max(now, span.startTime);
}

export function hasRunningSpans(store: Store): boolean {
  for (const trace of store.traces.values()) {
    if (trace.openCount > 0) {
      return true;
    }
  }
  return false;
}
