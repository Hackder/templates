import { type PropsWithChildren } from "hono/jsx";
import {
  isSerializedError,
  type JsonFields,
  type JsonValue,
  type Level,
  levelOrder,
  type ErrorJson,
  type SpanNode,
  spanEnd,
  type Store,
  type Trace,
  type TraceEvent,
} from "./model";
import { unaccent } from "../../src/utils";
import { type ViewState } from "./state";

// The whole UI as one server-rendered tree, re-patched over SSE on every
// state change. The only client-side state is the flame graph's pan/zoom
// (CSS variables driven by /assets/logview.js).

const FLAME_ROW_PX = 22;
const MAX_EVENT_ROWS = 300;

export function Shell({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>logview</title>
        <link rel="stylesheet" href="/assets/logview.css" />
        <script type="module" src="/static/datastar-1.0.2.js"></script>
        <script type="module" src="/assets/logview.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}

function formatClock(time: number): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(
    Math.floor(time),
  ).toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const hh = String(zoned.hour).padStart(2, "0");
  const mm = String(zoned.minute).padStart(2, "0");
  const ss = String(zoned.second).padStart(2, "0");
  const ms = String(zoned.millisecond).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs.toFixed(2)}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function formatFieldValue(value: JsonValue): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (typeof value === "string") {
    return value;
  } else {
    return JSON.stringify(value);
  }
}

function FieldsInline({ fields }: { fields: JsonFields }) {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return <></>;
  }
  return (
    <span class="fields">
      {entries.map(([key, value]) => (
        <span class="field">
          <span class="field-key">{key}=</span>
          {formatFieldValue(value)}
        </span>
      ))}
    </span>
  );
}

function LevelTag({ level }: { level: Level }) {
  return <span class={`level level-${level}`}>{level.toUpperCase()}</span>;
}

interface AppState {
  store: Store;
  view: ViewState;
  logPath: string;
  now: number;
}

function matchable(text: string): string {
  return unaccent(text.toLowerCase());
}

function traceMatches(trace: Trace, filter: string): boolean {
  if (filter === "") {
    return true;
  }
  const needle = matchable(filter);
  if (
    matchable(trace.rootName).includes(needle) ||
    matchable(trace.id).includes(needle)
  ) {
    return true;
  }
  for (const span of trace.spans.values()) {
    if (
      matchable(span.name).includes(needle) ||
      matchable(JSON.stringify(span.fields)).includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

function currentTrace(state: AppState): Trace | undefined {
  const { store, view } = state;
  if (!view.follow && view.selectedTraceId !== undefined) {
    return store.traces.get(view.selectedTraceId);
  }
  let newest: Trace | undefined;
  for (const trace of store.traces.values()) {
    if (traceMatches(trace, view.traceFilter)) {
      newest = trace;
    }
  }
  return newest;
}

export function AppView(state: AppState) {
  const trace = currentTrace(state);
  const selectedSpan =
    trace !== undefined && state.view.selectedSpanId !== undefined
      ? trace.spans.get(state.view.selectedSpanId)
      : undefined;

  // Panel sizes live as CSS vars in the inline style, written by the drag
  // handles in logview.js; data-preserve-attr keeps them across morphs.
  return (
    <main id="app" data-init="@get('/updates')" data-preserve-attr="style">
      <Header state={state} />
      <div class="cols">
        <TraceList state={state} trace={trace} />
        <div class="resizer resizer-v" data-resize="traces"></div>
        <div class="center">
          <FlamePanel state={state} trace={trace} selectedSpan={selectedSpan} />
          <div class="resizer resizer-h" data-resize="flame"></div>
          <EventsPanel state={state} trace={trace} />
        </div>
        <div class="resizer resizer-v" data-resize="inspector"></div>
        <Inspector state={state} trace={trace} span={selectedSpan} />
      </div>
    </main>
  );
}

function Header({ state }: { state: AppState }) {
  const { store, view } = state;
  return (
    <header class="header">
      <span class="title">
        BUN-HONO-DATASTAR<span class="title-sep">/</span>LOGVIEW
      </span>
      <span class="header-stat">{state.logPath}</span>
      <span class="header-stat">
        {store.traces.size} traces · {store.totalLines} lines
        {store.droppedTraces > 0 && ` · ${store.droppedTraces} dropped`}
      </span>
      {store.parseErrors > 0 && (
        <span class="header-stat stat-bad">
          {store.parseErrors} parse errors
        </span>
      )}
      <span class="header-spacer"></span>
      <button
        class={`btn ${view.follow ? "btn-on" : ""}`}
        data-on:click="@post('/actions/follow')"
      >
        FOLLOW
      </button>
    </header>
  );
}

function TraceList({
  state,
  trace: selected,
}: {
  state: AppState;
  trace: Trace | undefined;
}) {
  const { view, store } = state;
  const traces = [...store.traces.values()]
    .filter((trace) => traceMatches(trace, view.traceFilter))
    .reverse();
  return (
    <aside class="traces panel">
      <div class="panel-title">
        TRACES
        {view.traceFilter !== "" && (
          <span class="panel-title-detail">
            {traces.length}/{store.traces.size}
          </span>
        )}
        <span class="header-spacer"></span>
        <input
          class="filter-sm filter"
          type="text"
          placeholder="FILTER TRACES"
          data-signals__ifmissing={JSON.stringify({
            tracefilter: view.traceFilter,
          })}
          data-bind:tracefilter=""
          {...{
            "data-on:input__debounce.150ms": "@post('/actions/trace-filter')",
          }}
        />
      </div>
      <div class="trace-rows">
        {store.traces.size === 0 && (
          <div class="empty">
            No traces yet. Run the app — spans land here as they open.
          </div>
        )}
        {store.traces.size > 0 && traces.length === 0 && (
          <div class="empty">No trace matches the filter.</div>
        )}
        {traces.map((trace) => {
          const running = trace.openCount > 0;
          const duration =
            running || trace.endTime === undefined
              ? state.now - trace.startTime
              : trace.endTime - trace.startTime;
          // The root span's fields identify a trace at a glance.
          const rootFields = trace.roots[0]?.fields ?? {};
          return (
            <div
              class={`trace-row ${trace.id === selected?.id ? "selected" : ""}`}
              data-on:click={`@post('/actions/select-trace/${trace.id}')`}
            >
              <div class="trace-row-top">
                <span class="trace-name">{trace.rootName}</span>
                <span class="trace-dur">{formatDuration(duration)}</span>
              </div>
              {Object.keys(rootFields).length > 0 && (
                <div class="trace-fields">
                  <FieldsInline fields={rootFields} />
                </div>
              )}
              <div class="trace-row-bottom">
                <span>{formatClock(trace.startTime)}</span>
                <span>
                  {trace.spans.size}sp {trace.eventCount}ev
                </span>
                {running && <span class="badge badge-run">RUN</span>}
                {trace.warnCount > 0 && (
                  <span class="badge badge-warn">W {trace.warnCount}</span>
                )}
                {trace.errorCount > 0 && (
                  <span class="badge badge-err">ERR {trace.errorCount}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

interface PlacedSpan {
  span: SpanNode;
  row: number;
}

/** A contiguous block of rows holding every span of one tree depth. */
interface DepthBand {
  depth: number;
  startRow: number;
  rowCount: number;
}

interface FlameLayout {
  placed: PlacedSpan[];
  rowCount: number;
  bands: DepthBand[];
}

/**
 * Assigns each span a row. Parallel siblings (Promise.all) overlap in time,
 * so a plain depth-per-row flame graph would draw them on top of each other
 * and cover the shorter ones. Instead, all spans of one tree depth share a
 * contiguous band of rows: within a band they are greedily packed into lanes
 * (sequential spans share a row like a classic flame graph, overlapping ones
 * stack), and the band is as tall as its widest parallelism. Bands stack in
 * depth order and are rendered as alternating background stripes, so a bar's
 * stripe always tells its level — a span one stripe down is one level deeper,
 * never a covered sibling.
 */
/**
 * The span ids the flame graph renders while focused on one span: the path
 * of ancestors down to it plus its entire subtree — no siblings anywhere.
 */
export function focusVisibleIds(trace: Trace, focused: SpanNode): Set<string> {
  const visible = new Set<string>();
  for (
    let span: SpanNode | undefined = focused;
    span !== undefined;
    span =
      span.parentId === undefined ? undefined : trace.spans.get(span.parentId)
  ) {
    visible.add(span.id);
  }
  const stack = [...focused.children];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    visible.add(node.id);
    stack.push(...node.children);
  }
  return visible;
}

export function layoutSpans(
  roots: SpanNode[],
  now: number,
  visible?: Set<string>,
): FlameLayout {
  const placed: PlacedSpan[] = [];
  const bands: DepthBand[] = [];

  function shown(spans: SpanNode[]): SpanNode[] {
    if (visible === undefined) {
      return spans;
    }
    return spans.filter((span) => visible.has(span.id));
  }

  let level = shown(roots);
  let depth = 0;
  let startRow = 0;
  while (level.length > 0) {
    const ordered = [...level].sort((a, b) => a.startTime - b.startTime);
    const laneEnds: number[] = [];
    for (const span of ordered) {
      let lane = laneEnds.findIndex((end) => end <= span.startTime);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = spanEnd(span, now);
      placed.push({ span, row: startRow + lane });
    }
    bands.push({ depth, startRow, rowCount: laneEnds.length });
    startRow += laneEnds.length;
    depth += 1;
    level = shown(level.flatMap((span) => span.children));
  }

  return { placed, rowCount: startRow, bands };
}

function FlamePanel({
  state,
  trace,
  selectedSpan,
}: {
  state: AppState;
  trace: Trace | undefined;
  selectedSpan: SpanNode | undefined;
}) {
  if (trace === undefined) {
    return (
      <section class="panel flame">
        <div class="panel-title">FLAME</div>
        <div class="empty">Select a trace to see where its time went.</div>
      </section>
    );
  }

  const t0 = trace.startTime;
  const focusedSpan =
    state.view.focusedSpanId === undefined
      ? undefined
      : trace.spans.get(state.view.focusedSpanId);
  const visible =
    focusedSpan === undefined ? undefined : focusVisibleIds(trace, focusedSpan);
  const hiddenCount =
    visible === undefined ? 0 : trace.spans.size - visible.size;

  const { placed, rowCount, bands } = layoutSpans(
    trace.roots,
    state.now,
    visible,
  );
  let totalEnd = t0;
  for (const { span } of placed) {
    totalEnd = Math.max(totalEnd, spanEnd(span, state.now));
  }
  const selectedEvent =
    state.view.selectedEventSeq === undefined
      ? undefined
      : trace.events.find((e) => e.seq === state.view.selectedEventSeq);

  return (
    <section class="panel flame">
      <div class="panel-title">
        FLAME <span class="panel-title-detail">{trace.rootName}</span>
        <span class="panel-title-detail">
          {formatDuration(totalEnd - t0)} · {trace.spans.size} spans
        </span>
        <span class="header-spacer"></span>
        {focusedSpan !== undefined && (
          <button
            class="btn btn-on"
            data-on:click="@post('/actions/focus-span/none')"
          >
            FOCUS {focusedSpan.name} · {hiddenCount} hidden ×
          </button>
        )}
        <span class="hint">
          scroll vertical · pinch/Cmd/Ctrl+scroll zoom · drag pan
        </span>
        <button class="btn" id="flame-fit" type="button">
          FIT
        </button>
      </div>
      {/* Ticks are client-rendered (they depend on client zoom); keep morphs
          from wiping them between patches. */}
      <div id="flame-axis" class="flame-axis" data-ignore-morph=""></div>
      {/* The effect's arguments bake the trace id and total into the
          attribute, so Datastar re-runs it exactly when a patch changes
          either — the client re-fits/redraws with no observer of its own. */}
      <div
        id="flame-viewport"
        class="flame-viewport"
        data-trace={trace.id}
        data-total={totalEnd - t0}
        data-preserve-attr="style"
        data-effect={`window.logviewFlame?.(el, '${trace.id}', ${totalEnd - t0})`}
      >
        <div class="flame-canvas" style={`height:${rowCount * FLAME_ROW_PX}px`}>
          {bands.map((band) => (
            <div
              class={`flame-band ${band.depth % 2 === 1 ? "flame-band-alt" : ""}`}
              style={`top:${band.startRow * FLAME_ROW_PX}px;height:${band.rowCount * FLAME_ROW_PX}px`}
            ></div>
          ))}
          {/* Closing stripe in the next depth's shade, down to the bottom of
              the viewport, so the last band visibly ends. */}
          <div
            class={`flame-band ${bands.length % 2 === 1 ? "flame-band-alt" : ""}`}
            style={`top:${rowCount * FLAME_ROW_PX}px;bottom:0`}
          ></div>
          {selectedEvent !== undefined && (
            <div
              class="flame-marker flame-marker-selected"
              style={`--s:${selectedEvent.time - t0}`}
            ></div>
          )}
          {/* Hover marker, positioned by logview.js when an event row is
              hovered; ignore-morph keeps its client-set state. */}
          <div
            id="flame-marker"
            class="flame-marker flame-marker-hover"
            data-ignore-morph=""
            hidden
          ></div>
          {/* data-span/data-parent let logview.js light up a hovered bar's
              ancestors and descendants; a double-click toggles focus. */}
          {placed.map(({ span, row }) => {
            const start = span.startTime - t0;
            const duration = spanEnd(span, state.now) - span.startTime;
            const running = !span.closed;
            const classes = [
              "flame-span",
              span.owning ? "sp-owning" : "sp-section",
            ];
            if (span.errors.length > 0) {
              classes.push("sp-error");
            }
            if (running) {
              classes.push("sp-running");
            }
            if (span.id === selectedSpan?.id) {
              classes.push("selected");
            }
            if (span.id === focusedSpan?.id) {
              classes.push("sp-focused");
            }
            return (
              <div
                class={classes.join(" ")}
                style={`--s:${start};--d:${duration};top:${row * FLAME_ROW_PX}px`}
                data-span={span.id}
                data-parent={span.parentId}
                data-on:click={`@post('/actions/select-span/${span.id}')`}
                data-on:dblclick={`@post('/actions/focus-span/${span.id}')`}
              >
                <span class="flame-label">
                  {span.name}
                  <span class="flame-label-dur">
                    {" "}
                    {running ? "…" : formatDuration(duration)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function eventMatches(event: TraceEvent, minLevel: Level, filter: string) {
  if (levelOrder[event.level] < levelOrder[minLevel]) {
    return false;
  }
  if (filter === "") {
    return true;
  }
  const haystack = matchable(
    `${event.message} ${event.spanPath.join(" ")} ${JSON.stringify(event.fields)}`,
  );
  return haystack.includes(matchable(filter));
}

function EventRow({
  event,
  traceStart,
  selected,
}: {
  event: TraceEvent;
  /** Enables the hover time marker in the flame graph. */
  traceStart: number | undefined;
  selected: boolean;
}) {
  const markerAttr =
    traceStart === undefined
      ? {}
      : { "data-marker": String(event.time - traceStart) };
  return (
    <div
      class={`event-row clickable ${selected ? "selected" : ""}`}
      data-on:click={`@post('/actions/select-event/${event.seq}/${event.spanId ?? "none"}')`}
      {...markerAttr}
    >
      <span class="event-time">{formatClock(event.time)}</span>
      <LevelTag level={event.level} />
      <span class="event-body">
        {event.spanPath.length > 0 && (
          <span class="event-path">{event.spanPath.join("›")} </span>
        )}
        {event.message} <FieldsInline fields={event.fields} />
        {event.errors.map(({ key, error }) => (
          <span class="event-err">
            {key}: {error.name}: {error.message}
          </span>
        ))}
      </span>
    </div>
  );
}

function EventsPanel({
  state,
  trace,
}: {
  state: AppState;
  trace: Trace | undefined;
}) {
  const { view, store } = state;
  const levels: Level[] = ["debug", "info", "warn", "error"];
  const source = trace?.events ?? store.orphanEvents;
  const filtered = source.filter((event) =>
    eventMatches(event, view.minLevel, view.filter),
  );
  // Oldest first, so the order matches the spans in the flame graph.
  const rows = filtered.slice(-MAX_EVENT_ROWS);

  return (
    <section class="panel events">
      <div class="panel-title">
        EVENTS{" "}
        <span class="panel-title-detail">
          {trace === undefined ? "outside spans" : trace.rootName}
        </span>
        <span class="panel-title-detail">
          {rows.length}/{filtered.length} shown
        </span>
        <span class="header-spacer"></span>
        <span class="chip-row">
          {levels.map((level) => (
            <button
              class={`chip ${levelOrder[level] >= levelOrder[view.minLevel] ? "chip-on" : ""}`}
              data-on:click={`@post('/actions/min-level/${level}')`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </span>
        <input
          class="filter-sm filter"
          type="text"
          placeholder="FILTER EVENTS"
          data-signals__ifmissing={JSON.stringify({ filter: view.filter })}
          data-bind:filter=""
          {...{ "data-on:input__debounce.150ms": "@post('/actions/filter')" }}
        />
      </div>
      <div class="event-rows">
        {rows.length === 0 && <div class="empty">Nothing matches.</div>}
        {rows.map((event) => (
          <EventRow
            event={event}
            traceStart={trace?.startTime}
            selected={event.seq === view.selectedEventSeq}
          />
        ))}
      </div>
    </section>
  );
}

function ErrorBlock({ error }: { error: ErrorJson }) {
  return (
    <div class="error-block">
      <div class="error-head">
        {error.name}: {error.message}
      </div>
      {error.stack !== undefined && (
        <pre class="error-stack">{error.stack}</pre>
      )}
      {(error.errors ?? []).map((member) => (
        <div class="error-nested">
          <div class="error-nested-label">member</div>
          <NestedValue value={member} />
        </div>
      ))}
      {error.cause !== undefined && (
        <div class="error-nested">
          <div class="error-nested-label">caused by</div>
          <NestedValue value={error.cause} />
        </div>
      )}
    </div>
  );
}

/** A cause or aggregate member: an error block, or the JSON of a non-error. */
function NestedValue({ value }: { value: JsonValue }) {
  if (isSerializedError(value)) {
    return <ErrorBlock error={value} />;
  }
  return <pre class="error-stack">{JSON.stringify(value)}</pre>;
}

function KeyValueTable({ entries }: { entries: [string, string][] }) {
  return (
    <table class="kv">
      <tbody>
        {entries.map(([key, value]) => (
          <tr>
            <td class="kv-key">{key}</td>
            <td class="kv-value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface SpanMetrics {
  durationMs: number;
  selfMs: number;
  sameName: {
    count: number;
    totalMs: number;
    totalSelfMs: number;
    averageMs: number;
    averageSelfMs: number;
    minMs: number;
    maxMs: number;
  };
  sections: {
    name: string;
    count: number;
    totalMs: number;
    totalSelfMs: number;
  }[];
}

interface SpanTime {
  durationMs: number;
  selfMs: number;
}

/** Self time excludes the union of direct-child intervals, including overlap. */
function spanDurationAndSelf(span: SpanNode, now: number): SpanTime {
  const end = spanEnd(span, now);
  const durationMs = end - span.startTime;
  const intervals = span.children
    .map((child): [number, number] => [
      Math.max(span.startTime, child.startTime),
      Math.min(end, spanEnd(child, now)),
    ])
    .filter(([start, childEnd]) => childEnd > start)
    .sort(([startA], [startB]) => startA - startB);

  let childMs = 0;
  let coveredStart = 0;
  let coveredEnd = 0;
  for (const [start, childEnd] of intervals) {
    if (childEnd <= coveredEnd) {
      continue;
    }
    if (start > coveredEnd) {
      childMs += coveredEnd - coveredStart;
      coveredStart = start;
    }
    coveredEnd = childEnd;
  }
  childMs += coveredEnd - coveredStart;

  return { durationMs, selfMs: Math.max(0, durationMs - childMs) };
}

export function getSpanMetrics(
  trace: Trace,
  selected: SpanNode,
  now: number,
): SpanMetrics {
  const selectedTime = spanDurationAndSelf(selected, now);
  const matching = [...trace.spans.values()].filter(
    (span) => span.name === selected.name,
  );
  const matchingTimes = matching.map((span) => spanDurationAndSelf(span, now));
  const totalMs = matchingTimes.reduce((sum, time) => sum + time.durationMs, 0);
  const totalSelfMs = matchingTimes.reduce((sum, time) => sum + time.selfMs, 0);

  const sections = new Map<
    string,
    { name: string; count: number; totalMs: number; totalSelfMs: number }
  >();
  const descendants = [...selected.children];
  for (
    let descendant = descendants.pop();
    descendant !== undefined;
    descendant = descendants.pop()
  ) {
    const time = spanDurationAndSelf(descendant, now);
    const aggregate = sections.get(descendant.name) ?? {
      name: descendant.name,
      count: 0,
      totalMs: 0,
      totalSelfMs: 0,
    };
    aggregate.count += 1;
    aggregate.totalMs += time.durationMs;
    aggregate.totalSelfMs += time.selfMs;
    sections.set(descendant.name, aggregate);
    descendants.push(...descendant.children);
  }

  return {
    ...selectedTime,
    sameName: {
      count: matching.length,
      totalMs,
      totalSelfMs,
      averageMs: totalMs / matching.length,
      averageSelfMs: totalSelfMs / matching.length,
      minMs: Math.min(...matchingTimes.map((time) => time.durationMs)),
      maxMs: Math.max(...matchingTimes.map((time) => time.durationMs)),
    },
    sections: [...sections.values()].sort((a, b) => b.totalMs - a.totalMs),
  };
}

function Inspector({
  state,
  trace,
  span,
}: {
  state: AppState;
  trace: Trace | undefined;
  span: SpanNode | undefined;
}) {
  if (trace === undefined || span === undefined) {
    return (
      <aside class="inspector panel">
        <div class="panel-title">SPAN</div>
        <div class="empty">Click a span in the flame graph to inspect it.</div>
      </aside>
    );
  }

  const running = !span.closed;
  const metrics = getSpanMetrics(trace, span, state.now);

  let status = "closed";
  if (running) {
    status = "running";
  } else if (span.errors.length > 0) {
    status = "failed";
  }

  const summary: [string, string][] = [
    ["kind", span.owning ? "owning span" : "section"],
    ["status", status],
    ["start", formatClock(span.startTime)],
    ["offset", `+${formatDuration(span.startTime - trace.startTime)}`],
    [
      "duration",
      running
        ? `${formatDuration(metrics.durationMs)} …`
        : formatDuration(metrics.durationMs),
    ],
    ["self time", formatDuration(metrics.selfMs)],
    ["child time", formatDuration(metrics.durationMs - metrics.selfMs)],
    ["span id", span.id],
    ["trace id", trace.id],
  ];

  const timingEntries: [string, string][] = metrics.sections.map((timing) => [
    timing.name,
    `${formatDuration(timing.totalMs)} total · ${formatDuration(timing.totalSelfMs)} self / ${timing.count}×`,
  ]);
  const typeEntries: [string, string][] = [
    ["occurrences", String(metrics.sameName.count)],
    ["total duration", formatDuration(metrics.sameName.totalMs)],
    ["total self time", formatDuration(metrics.sameName.totalSelfMs)],
    ["average duration", formatDuration(metrics.sameName.averageMs)],
    ["average self time", formatDuration(metrics.sameName.averageSelfMs)],
    ["minimum duration", formatDuration(metrics.sameName.minMs)],
    ["maximum duration", formatDuration(metrics.sameName.maxMs)],
  ];
  const counterEntries: [string, string][] = Object.entries(span.counters).map(
    ([name, count]) => [name, String(count)],
  );

  return (
    <aside class="inspector panel">
      <div class="panel-title">
        SPAN <span class="panel-title-detail">{span.name}</span>
        <span class="header-spacer"></span>
        <button
          class={`btn ${state.view.focusedSpanId === span.id ? "btn-on" : ""}`}
          data-on:click={`@post('/actions/focus-span/${span.id}')`}
        >
          {state.view.focusedSpanId === span.id ? "UNFOCUS" : "FOCUS"}
        </button>
        <button class="btn" data-on:click="@post('/actions/select-span/none')">
          ×
        </button>
      </div>
      <div class="inspector-body">
        <KeyValueTable entries={summary} />
        <div class="section-title">TYPE TOTALS · {span.name}</div>
        <KeyValueTable entries={typeEntries} />
        {counterEntries.length > 0 && (
          <>
            <div class="section-title">COUNTERS</div>
            <KeyValueTable entries={counterEntries} />
          </>
        )}
        {Object.keys(span.fields).length > 0 && (
          <>
            <div class="section-title">FIELDS</div>
            <KeyValueTable
              entries={Object.entries(span.fields).map(([key, value]) => [
                key,
                formatFieldValue(value),
              ])}
            />
          </>
        )}
        {timingEntries.length > 0 && (
          <>
            <div class="section-title">SECTION TIMINGS</div>
            <KeyValueTable entries={timingEntries} />
          </>
        )}
        {span.errors.map(({ key, error }) => (
          <>
            <div class="section-title">ERROR · {key}</div>
            <ErrorBlock error={error} />
          </>
        ))}
      </div>
    </aside>
  );
}
