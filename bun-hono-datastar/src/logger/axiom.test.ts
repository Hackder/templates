import { describe, expect, spyOn, test } from "bun:test";
import { jsonParse } from "../std";
import type { FetchFunction } from "../utils";
import { axiomSink, toAttributes, toUnixNano } from "./axiom";
import type { LogRecord } from "./record";

interface Sent {
  url: string;
  dataset: string | undefined;
  body: unknown;
}

function fakeFetch(statuses: number[] = []) {
  const sent: Sent[] = [];
  async function fetchFn(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const request = new Request(input, init);
    const body = jsonParse(await request.text());
    sent.push({
      url: request.url,
      dataset: request.headers.get("X-Axiom-Dataset") ?? undefined,
      body: body.ok ? body.value : body.error,
    });
    const status = statuses.shift() ?? 200;
    return new Response(status === 200 ? "{}" : "nope", { status });
  }
  return { sent, fetchFn };
}

function makeSink(fetchFn: FetchFunction) {
  return axiomSink({
    url: "https://api.example",
    token: "secret",
    tracesDataset: "traces",
    logsDataset: "logs",
    serviceName: "svc",
    environment: "test",
    fetchFn,
    flushIntervalMs: 60_000,
  });
}

const spanBase = {
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
  owning: true,
  fields: {},
} as const;

describe("toUnixNano", () => {
  test("keeps sub-millisecond precision without float overflow", () => {
    expect(toUnixNano(1_788_120_057_903.5)).toBe("1788120057903500000");
    expect(toUnixNano(0)).toBe("0");
  });
});

describe("toAttributes", () => {
  test("flattens nested fields and types primitives", () => {
    expect(
      toAttributes({
        s: "x",
        i: 3,
        d: 1.5,
        b: true,
        nil: null,
        nested: { date: "2026-09-05", deep: { n: 1 } },
        list: [1, "two", { three: 3 }],
      }),
    ).toEqual([
      { key: "s", value: { stringValue: "x" } },
      { key: "i", value: { intValue: "3" } },
      { key: "d", value: { doubleValue: 1.5 } },
      { key: "b", value: { boolValue: true } },
      { key: "nested.date", value: { stringValue: "2026-09-05" } },
      { key: "nested.deep.n", value: { intValue: "1" } },
      {
        key: "list",
        value: {
          arrayValue: {
            values: [
              { intValue: "1" },
              { stringValue: "two" },
              { stringValue: '{"three":3}' },
            ],
          },
        },
      },
    ]);
  });
});

describe("axiomSink", () => {
  test("ships closed spans as OTLP spans and events as OTLP logs", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);

    const records: LogRecord[] = [
      {
        kind: "spanOpen",
        ...spanBase,
        name: "request",
        spanKind: "server",
        time: 1000,
      },
      {
        kind: "event",
        level: "info",
        time: 1001,
        message: "hello",
        fields: { n: 1 },
        traceId: spanBase.traceId,
        spanId: spanBase.spanId,
      },
      {
        kind: "event",
        level: "warn",
        time: 1002,
        message: "slow",
        fields: { ms: 40 },
        context: { "url.path": "/" },
        traceId: spanBase.traceId,
        spanId: spanBase.spanId,
      },
      {
        kind: "spanClose",
        ...spanBase,
        name: "request",
        spanKind: "server",
        level: "info",
        time: 1010.25,
        startTime: 1000,
        durationMs: 10.25,
        traceOrigin: "request",
        fields: { "url.path": "/", "http.response.status_code": 200 },
        counters: { dbQueries: 3 },
      },
      {
        kind: "event",
        level: "info",
        time: 1011,
        message: "outside",
        fields: {},
      },
    ];
    sink.emit(records);
    await sink.flush();

    expect(sent.map((s) => [s.url, s.dataset])).toEqual([
      ["https://api.example/v1/traces", "traces"],
      ["https://api.example/v1/logs", "logs"],
    ]);

    const traces = sent[0]?.body;
    expect(traces).toMatchObject({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "svc" } },
              { key: "deployment.environment", value: { stringValue: "test" } },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: spanBase.traceId,
                  spanId: spanBase.spanId,
                  name: "request",
                  kind: 2,
                  startTimeUnixNano: "1000000000",
                  endTimeUnixNano: "1010250000",
                  status: { code: 0 },
                  attributes: [
                    { key: "url.path", value: { stringValue: "/" } },
                    {
                      key: "http.response.status_code",
                      value: { intValue: "200" },
                    },
                    { key: "counters.dbQueries", value: { intValue: "3" } },
                    { key: "span.owning", value: { boolValue: true } },
                    {
                      key: "trace.origin",
                      value: { stringValue: "request" },
                    },
                  ],
                  // Only the warning rides along as a span event.
                  events: [
                    {
                      name: "slow",
                      timeUnixNano: "1002000000",
                      attributes: [
                        { key: "log.level", value: { stringValue: "warn" } },
                        { key: "ms", value: { intValue: "40" } },
                        {
                          key: "context.url.path",
                          value: { stringValue: "/" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(sent[1]?.body).toMatchObject({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1001000000",
                  severityNumber: 9,
                  severityText: "INFO",
                  body: { stringValue: "hello" },
                  traceId: spanBase.traceId,
                  spanId: spanBase.spanId,
                },
                { severityNumber: 13, severityText: "WARN" },
                { body: { stringValue: "outside" } },
              ],
            },
          ],
        },
      ],
    });
  });

  test("error fields set the span status and become exception events", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);

    sink.emit([
      {
        kind: "spanClose",
        ...spanBase,
        name: "request",
        spanKind: "server",
        level: "error",
        time: 20,
        startTime: 10,
        durationMs: 10,
        fields: {
          path: "/",
          apiErr: {
            $error: true,
            name: "Error",
            message: "api down",
            stack: "Error: api down\n  at x",
            cause: { $error: true, name: "Error", message: "timeout" },
          },
        },
        counters: {},
      },
    ]);
    await sink.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toMatchObject({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  status: { code: 2, message: "Error: api down" },
                  attributes: [
                    { key: "path", value: { stringValue: "/" } },
                    { key: "span.owning", value: { boolValue: true } },
                  ],
                  events: [
                    {
                      name: "exception",
                      timeUnixNano: "20000000",
                      attributes: [
                        {
                          key: "exception.type",
                          value: { stringValue: "Error" },
                        },
                        {
                          key: "exception.message",
                          value: { stringValue: "api down" },
                        },
                        {
                          key: "exception.stacktrace",
                          value: {
                            stringValue:
                              "Error: api down\n  at x\ncaused by: Error: timeout",
                          },
                        },
                        { key: "error.key", value: { stringValue: "apiErr" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("nested errors become exception events under their path", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);

    sink.emit([
      {
        kind: "spanClose",
        ...spanBase,
        name: "request",
        spanKind: "internal",
        level: "error",
        time: 20,
        startTime: 10,
        durationMs: 10,
        fields: {
          api: {
            retries: 2,
            err: { $error: true, name: "Error", message: "nested" },
          },
        },
        counters: {},
      },
    ]);
    await sink.flush();

    expect(sent[0]?.body).toMatchObject({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  status: { code: 2, message: "Error: nested" },
                  attributes: [
                    { key: "api.retries", value: { intValue: "2" } },
                    { key: "span.owning", value: { boolValue: true } },
                  ],
                  events: [
                    {
                      name: "exception",
                      attributes: [
                        {
                          key: "exception.type",
                          value: { stringValue: "Error" },
                        },
                        {
                          key: "exception.message",
                          value: { stringValue: "nested" },
                        },
                        {
                          key: "exception.stacktrace",
                          value: { stringValue: "Error: nested" },
                        },
                        {
                          key: "error.key",
                          value: { stringValue: "api.err" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("caps the warnings kept for a span and notes how many were dropped", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);

    const warnings: LogRecord[] = [];
    for (let i = 0; i < 105; i += 1) {
      warnings.push({
        kind: "event",
        level: "warn",
        time: 1000 + i,
        message: `warning ${i}`,
        fields: {},
        traceId: spanBase.traceId,
        spanId: spanBase.spanId,
      });
    }
    sink.emit(warnings);
    sink.emit([
      {
        kind: "spanClose",
        ...spanBase,
        name: "job",
        spanKind: "internal",
        level: "info",
        time: 2000,
        startTime: 1000,
        durationMs: 1000,
        fields: {},
        counters: {},
      },
    ]);
    await sink.flush();

    const traces = sent.find((s) => s.dataset === "traces");
    if (traces === undefined) {
      throw new Error("expected a traces request");
    }
    expect(traces.body).toMatchObject({
      resourceSpans: [{ scopeSpans: [{ spans: [{ name: "job" }] }] }],
    });
    // SAFETY: the shape was just asserted above.
    const events = (
      traces.body as {
        resourceSpans: {
          scopeSpans: { spans: { events: unknown[] }[] }[];
        }[];
      }
    ).resourceSpans[0]?.scopeSpans[0]?.spans[0]?.events;
    expect(events).toHaveLength(101);
    expect(events?.[0]).toMatchObject({ name: "warning 0" });
    expect(events?.at(-1)).toEqual({
      name: "span events dropped",
      timeUnixNano: "2000000000",
      attributes: [{ key: "dropped", value: { intValue: "5" } }],
    });
  });

  test("a trailing slash on the origin does not double the path separator", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = axiomSink({
      url: "https://api.example/",
      token: "secret",
      tracesDataset: "traces",
      logsDataset: "logs",
      serviceName: "svc",
      environment: "test",
      fetchFn,
      flushIntervalMs: 60_000,
    });
    sink.emit([
      { kind: "event", level: "info", time: 1, message: "x", fields: {} },
    ]);
    await sink.flush();
    expect(sent[0]?.url).toBe("https://api.example/v1/logs");
  });

  test("records queued during a send go out in the next round of the same drain", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);
    const record: LogRecord = {
      kind: "event",
      level: "info",
      time: 1,
      message: "x",
      fields: {},
    };

    sink.emit([record]);
    const first = sink.flush();
    sink.emit([record]);
    await first;
    expect(sent).toHaveLength(2);
  });

  test("retries server errors and gives up on client errors", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(
      () => undefined,
    );
    try {
      const { sent, fetchFn } = fakeFetch([503, 200, 400]);
      const sink = makeSink(fetchFn);
      const record: LogRecord = {
        kind: "event",
        level: "info",
        time: 1,
        message: "x",
        fields: {},
      };

      sink.emit([record]);
      await sink.flush();
      expect(sent).toHaveLength(2);
      expect(consoleError).not.toHaveBeenCalled();

      sink.emit([record]);
      await sink.flush();
      expect(sent).toHaveLength(3);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("flush with nothing queued sends nothing", async () => {
    const { sent, fetchFn } = fakeFetch();
    const sink = makeSink(fetchFn);
    await sink.flush();
    expect(sent).toHaveLength(0);
  });
});
