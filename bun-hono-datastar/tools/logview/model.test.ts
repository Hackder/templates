import { describe, expect, test } from "bun:test";
import { applyLine, createStore } from "./model";

describe("applyLine", () => {
  test("returns malformed JSON errors while counting them", () => {
    const store = createStore();

    const error = applyLine(store, "not json");

    expect(error).toBeInstanceOf(Error);
    expect(store.totalLines).toBe(1);
    expect(store.parseErrors).toBe(1);
  });

  test("returns schema errors while counting them", () => {
    const store = createStore();

    const error = applyLine(store, JSON.stringify({ kind: "unknown" }));

    expect(error).toBeInstanceOf(Error);
    expect(store.totalLines).toBe(1);
    expect(store.parseErrors).toBe(1);
  });

  test("stores counters on closed sections", () => {
    const store = createStore();
    const common = {
      name: "db-query",
      spanKind: "client",
      fields: { "db.query.text": "select * from movie" },
      traceId: "trace",
      spanId: "query",
      owning: false,
    };

    applyLine(store, JSON.stringify({ kind: "spanOpen", ...common, time: 10 }));
    const error = applyLine(
      store,
      JSON.stringify({
        kind: "spanClose",
        ...common,
        level: "debug",
        time: 12,
        startTime: 10,
        durationMs: 2,
        counters: { dbQueries: 1, dbRows: 4 },
      }),
    );

    expect(error).toBeUndefined();
    expect(store.traces.get("trace")?.spans.get("query")?.counters).toEqual({
      dbQueries: 1,
      dbRows: 4,
    });
  });

  test("pulls named error fields out of events and closed spans", () => {
    const store = createStore();
    const apiErr = {
      $error: true as const,
      name: "Error",
      message: "api down",
      stack: "Error: api down",
    };
    const dbErr = { $error: true as const, name: "Error", message: "db down" };

    applyLine(
      store,
      JSON.stringify({
        kind: "event",
        level: "error",
        message: "Lookup failed",
        fields: { item: "first", err: apiErr },
        traceId: "trace",
        spanId: "request",
        time: 10,
      }),
    );
    applyLine(
      store,
      JSON.stringify({
        kind: "spanClose",
        level: "error",
        name: "request",
        spanKind: "server",
        fields: { path: "/items", apiErr, dbErr, notAnErr: "plain" },
        traceId: "trace",
        spanId: "request",
        owning: true,
        time: 12,
        startTime: 8,
        durationMs: 4,
        counters: {},
      }),
    );

    const trace = store.traces.get("trace");
    expect(trace?.events[0]?.fields).toEqual({ item: "first" });
    expect(trace?.events[0]?.errors).toEqual([{ key: "err", error: apiErr }]);

    const span = trace?.spans.get("request");
    expect(span?.fields).toEqual({ path: "/items", notAnErr: "plain" });
    expect(span?.errors).toEqual([
      { key: "apiErr", error: apiErr },
      { key: "dbErr", error: dbErr },
    ]);
    expect(trace?.errorCount).toBe(2);
  });

  test("builds the span tree from parent ids and resolves event paths", () => {
    const store = createStore();
    const base = { spanKind: "internal", owning: false, traceId: "t" };
    applyLine(
      store,
      JSON.stringify({
        kind: "spanOpen",
        ...base,
        owning: true,
        name: "request",
        spanId: "req",
        fields: {},
        time: 1,
      }),
    );
    applyLine(
      store,
      JSON.stringify({
        kind: "spanOpen",
        ...base,
        name: "render",
        spanId: "ren",
        parentSpanId: "req",
        fields: {},
        time: 2,
      }),
    );
    applyLine(
      store,
      JSON.stringify({
        kind: "event",
        level: "info",
        message: "hello",
        fields: {},
        traceId: "t",
        spanId: "ren",
        time: 3,
      }),
    );

    const trace = store.traces.get("t");
    expect(trace?.rootName).toBe("request");
    expect(trace?.roots.map((s) => s.id)).toEqual(["req"]);
    expect(trace?.spans.get("ren")?.parentId).toBe("req");
    expect(trace?.spans.get("ren")?.depth).toBe(1);
    expect(trace?.events[0]?.spanPath).toEqual(["request", "render"]);
    expect(trace?.events[0]?.spanIds).toEqual(["req", "ren"]);
    expect(trace?.spans.get("ren")?.events).toHaveLength(1);
  });
});
