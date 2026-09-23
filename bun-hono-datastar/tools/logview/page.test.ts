import { describe, expect, test } from "bun:test";
import { type SpanNode, type Trace } from "./model";
import { focusVisibleIds, getSpanMetrics, layoutSpans } from "./page";

function span(
  name: string,
  startTime: number,
  durationMs: number | undefined,
  children: SpanNode[] = [],
): SpanNode {
  return {
    id: name,
    parentId: undefined,
    name,
    owning: true,
    depth: 0,
    fields: {},
    startTime,
    durationMs,
    closed: durationMs !== undefined,
    level: "info",
    errors: [],
    counters: {},
    children,
    events: [],
  };
}

function rowOf(layout: ReturnType<typeof layoutSpans>, name: string): number {
  const placedSpan = layout.placed.find((p) => p.span.name === name);
  if (placedSpan === undefined) {
    throw new Error(`span ${name} not placed`);
  }
  return placedSpan.row;
}

describe("layoutSpans", () => {
  test("sequential siblings share one row like a classic flame graph", () => {
    const root = span("root", 0, 100, [
      span("a", 0, 40),
      span("b", 40, 30),
      span("c", 75, 20),
    ]);
    const layout = layoutSpans([root], 1000);

    expect(rowOf(layout, "root")).toBe(0);
    expect(rowOf(layout, "a")).toBe(1);
    expect(rowOf(layout, "b")).toBe(1);
    expect(rowOf(layout, "c")).toBe(1);
    expect(layout.rowCount).toBe(2);
  });

  test("overlapping parallel siblings stack into separate rows", () => {
    const root = span("root", 0, 100, [
      span("a", 0, 50),
      span("b", 10, 50),
      span("after-a", 55, 30), // fits back into a's lane
    ]);
    const layout = layoutSpans([root], 1000);

    expect(rowOf(layout, "a")).toBe(1);
    expect(rowOf(layout, "b")).toBe(2);
    expect(rowOf(layout, "after-a")).toBe(1);
    expect(layout.rowCount).toBe(3);
  });

  test("each depth gets one contiguous band; children start below it", () => {
    const root = span("root", 0, 100, [
      span("a", 0, 50, [span("a-child", 5, 40)]),
      span("b", 10, 60),
    ]);
    const layout = layoutSpans([root], 1000);

    // Depth 1 (a ∥ b) occupies rows 1-2; depth 2 starts below the band, so
    // b can never read as a-child's parent.
    expect(rowOf(layout, "a")).toBe(1);
    expect(rowOf(layout, "b")).toBe(2);
    expect(rowOf(layout, "a-child")).toBe(3);
    expect(layout.rowCount).toBe(4);
    expect(layout.bands).toEqual([
      { depth: 0, startRow: 0, rowCount: 1 },
      { depth: 1, startRow: 1, rowCount: 2 },
      { depth: 2, startRow: 3, rowCount: 1 },
    ]);
  });

  test("a running span blocks its lane until now", () => {
    const root = span("root", 0, undefined, [
      span("running", 0, undefined),
      span("later", 500, 10), // running span's end is `now`, so this overlaps
    ]);
    const layout = layoutSpans([root], 1000);

    expect(rowOf(layout, "running")).toBe(1);
    expect(rowOf(layout, "later")).toBe(2);
    expect(layout.rowCount).toBe(3);
  });
});

function asTrace(roots: SpanNode[]): Trace {
  const spans = new Map<string, SpanNode>();
  interface LinkItem {
    node: SpanNode;
    parentId: string | undefined;
  }
  const stack: LinkItem[] = roots.map((root) => ({
    node: root,
    parentId: undefined,
  }));
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    item.node.parentId = item.parentId;
    spans.set(item.node.id, item.node);
    for (const child of item.node.children) {
      stack.push({ node: child, parentId: item.node.id });
    }
  }
  return {
    id: "trace",
    seq: 0,
    rootName: roots[0]?.name ?? "?",
    startTime: 0,
    endTime: undefined,
    openCount: 0,
    errorCount: 0,
    warnCount: 0,
    eventCount: 0,
    maxDepth: 0,
    roots,
    spans,
    events: [],
  };
}

describe("focusVisibleIds", () => {
  test("keeps only the ancestor path and the focused span's subtree", () => {
    const focusTarget = span("a", 0, 50, [span("a-child", 5, 40)]);
    const trace = asTrace([
      span("root", 0, 100, [
        focusTarget,
        span("b", 10, 60, [span("b-child", 15, 30)]),
        span("after", 55, 20),
      ]),
    ]);

    const visible = focusVisibleIds(trace, focusTarget);
    expect([...visible].sort()).toEqual(["a", "a-child", "root"]);

    const layout = layoutSpans(trace.roots, 1000, visible);
    expect(layout.placed.map((p) => p.span.name).sort()).toEqual([
      "a",
      "a-child",
      "root",
    ]);
    expect(rowOf(layout, "root")).toBe(0);
    expect(rowOf(layout, "a")).toBe(1);
    expect(rowOf(layout, "a-child")).toBe(2);
    expect(layout.rowCount).toBe(3);
  });
});

describe("getSpanMetrics", () => {
  test("calculates self time from overlapping direct children", () => {
    const selected = span("root", 0, 100, [
      span("task-a", 10, 40),
      span("task-b", 30, 30),
    ]);
    const trace = asTrace([selected]);

    const metrics = getSpanMetrics(trace, selected, 100);

    expect(metrics.durationMs).toBe(100);
    expect(metrics.selfMs).toBe(50);
  });

  test("aggregates same-name spans and all descendant timings for sections", () => {
    const first = span("query", 0, 40, [
      span("decode", 10, 20, [span("parse", 15, 8)]),
    ]);
    first.owning = false;
    const second = span("query", 50, 30);
    second.id = "query-2";
    second.owning = false;
    const trace = asTrace([span("request", 0, 100, [first, second])]);

    const metrics = getSpanMetrics(trace, first, 100);

    expect(metrics.sameName).toEqual({
      count: 2,
      totalMs: 70,
      totalSelfMs: 50,
      averageMs: 35,
      averageSelfMs: 25,
      minMs: 30,
      maxMs: 40,
    });
    expect(metrics.sections).toEqual([
      { name: "decode", count: 1, totalMs: 20, totalSelfMs: 12 },
      { name: "parse", count: 1, totalMs: 8, totalSelfMs: 8 },
    ]);
  });
});
