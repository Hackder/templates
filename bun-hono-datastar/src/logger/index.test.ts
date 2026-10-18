import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { DrizzleQueryError } from "drizzle-orm";
import {
  consoleTransport,
  logger,
  memoryTransport,
  setTransports,
  toJsonFields,
  toJsonValue,
  withSection,
  withSpan,
} from ".";
import type { LogRecord } from "./record";

function capture() {
  const transport = memoryTransport();
  setTransports([transport]);
  return transport;
}

afterEach(() => {
  setTransports([]);
});

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- thrown values are unknown
function throwValue(value: unknown): never {
  throw value;
}

function spanCloses(records: LogRecord[]) {
  return records.filter((r) => r.kind === "spanClose");
}

function spanOpens(records: LogRecord[]) {
  return records.filter((r) => r.kind === "spanOpen");
}

function events(records: LogRecord[]) {
  return records.filter((r) => r.kind === "event");
}

describe("events", () => {
  test("carries level, message, fields and the enclosing span ids", () => {
    const transport = capture();

    withSpan("request", { path: "/movie" }, () => {
      withSection("render", {}, () => {
        logger().info("Rendered page", { items: 3 });
      });
    });

    const event = events(transport.records).find(
      (r) => r.message === "Rendered page",
    );
    const [requestOpen, renderOpen] = spanOpens(transport.records);
    expect(event).toBeDefined();
    expect(event?.level).toBe("info");
    expect(event?.fields).toEqual({ items: 3 });
    expect(event?.traceId).toBe(requestOpen?.traceId);
    expect(event?.spanId).toBe(renderOpen?.spanId);
    expect(renderOpen?.parentSpanId).toBe(requestOpen?.spanId);
    expect(requestOpen?.fields).toEqual({ path: "/movie" });
  });

  test("warnings and errors snapshot the enclosing spans' current fields", () => {
    const transport = capture();

    withSpan("request", { path: "/" }, () => {
      logger().set({ status: 500 });
      withSection("render", { part: "list" }, () => {
        logger().info("plain");
        logger().warn("slow", { path: "own" });
      });
    });

    const [info, warn] = events(transport.records);
    expect(info?.context).toBeUndefined();
    expect(warn?.context).toEqual({ path: "/", status: 500, part: "list" });
    expect(warn?.fields).toEqual({ path: "own" });
  });

  test("Temporal and bigint values arrive as JSON strings", () => {
    const transport = capture();

    logger().info("event", {
      date: Temporal.PlainDate.from("2026-09-05"),
      big: 10n,
      nested: { instant: Temporal.Instant.from("2026-09-05T16:00:00Z") },
    });

    expect(transport.records[0]?.fields).toEqual({
      date: "2026-09-05",
      big: "10",
      nested: { instant: "2026-09-05T16:00:00Z" },
    });
  });

  test("the err field is serialized in place with its cause chain", () => {
    const transport = capture();

    const cause = new Error("connection refused");
    logger().error("Import failed", {
      item: 1,
      err: new Error("fetch failed", { cause }),
    });

    const event = transport.records[0];
    expect(event?.fields.item).toBe(1);
    const err = event?.fields.err;
    expect(err).toMatchObject({
      name: "Error",
      message: "fetch failed",
      cause: { message: "connection refused" },
    });
    expect(err).toHaveProperty("stack");
  });

  test("err accepts non-Error values and keeps them as they are", () => {
    const transport = capture();

    logger().error("Request failed", { attempt: 2, err: "socket hang up" });

    const event = transport.records[0];
    expect(event?.fields.attempt).toBe(2);
    expect(event?.fields.err).toBe("socket hang up");
  });

  test("errors are recognised by what they are, under any key", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      logger().set({ failure: new Error("plain key") });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.failure).toMatchObject({
      $error: true,
      message: "plain key",
    });
  });

  test("an error nested in an object or array still closes the span at error", () => {
    const transport = capture();

    withSpan("object", {}, () => {
      logger().set({ nested: { inner: new Error("deep") } });
    });
    withSpan("array", {}, () => {
      logger().set({ list: [1, new Error("in list")] });
    });

    const [objectClose, arrayClose] = spanCloses(transport.records);
    expect(objectClose?.level).toBe("error");
    expect(objectClose?.fields.nested).toMatchObject({
      inner: { $error: true, message: "deep" },
    });
    expect(arrayClose?.level).toBe("error");
  });

  test("cyclic and very deep values are cut off instead of overflowing", () => {
    interface Loop {
      name: string;
      self?: Loop;
    }
    const cyclic: Loop = { name: "loop" };
    cyclic.self = cyclic;
    const asJson = toJsonValue(cyclic);
    expect(JSON.stringify(asJson)).toContain("loop");

    const cause: Loop = { name: "cause" };
    cause.self = cause;
    const transport = capture();
    expect(() =>
      logger().error("cyclic cause", {
        err: new Error("outer", { cause }),
      }),
    ).not.toThrow();
    expect(transport.records).toHaveLength(1);
  });

  test("named errors set on a span all appear on its close line", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      logger().set({ apiErr: new Error("api down") });
      logger().set({ dbErr: new Error("db down") });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.apiErr).toMatchObject({ message: "api down" });
    expect(close?.fields.dbErr).toMatchObject({ message: "db down" });
  });

  test("setting an existing key keeps both values under suffixed keys", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      logger().set({ apiErr: new Error("first") });
      logger().set({ apiErr: new Error("second") });
      logger().set({ apiErr: new Error("third") });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.fields.apiErr).toMatchObject({ message: "first" });
    expect(close?.fields.apiErr2).toMatchObject({ message: "second" });
    expect(close?.fields.apiErr3).toMatchObject({ message: "third" });
  });

  test("setOnce keeps the first value and reports who set it", () => {
    const transport = capture();
    const set: boolean[] = [];

    withSpan("request", {}, () => {
      set.push(logger().setOnce({ "cache.items": "miss" }));
      set.push(logger().setOnce({ "cache.items": "hit" }));
    });

    const [close] = spanCloses(transport.records);
    expect(set).toEqual([true, false]);
    expect(close?.fields["cache.items"]).toBe("miss");
    expect(close?.fields["cache.items2"]).toBeUndefined();
  });

  test("suffixed error keys still count as errors on the close line", () => {
    const transport = capture();

    withSpan("request", { apiErr: new Error("first") }, () => {
      logger().set({ apiErr: new Error("second") });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.apiErr2).toMatchObject({ name: "Error" });
  });

  test("toJsonFields walks every value with one serializer", () => {
    const fields = {
      value: 1,
      anotherValue: Temporal.Now.plainDateISO(),
      loginErr: new Error("This is an error"),
      gone: undefined,
    };

    const serialized = toJsonFields(fields);
    expect(serialized.value).toEqual(1);
    expect(serialized.anotherValue).toEqual(fields.anotherValue.toString());
    expect(serialized.loginErr).toMatchObject({
      $error: true,
      name: "Error",
      message: "This is an error",
    });
    expect("gone" in serialized).toBe(false);
  });
});

describe("console transport", () => {
  test("formats high-resolution epoch timestamps", () => {
    const consoleLog = spyOn(console, "log").mockImplementation(
      () => undefined,
    );

    try {
      const transport = consoleTransport({ level: "debug", color: false });
      expect(() =>
        transport.emit({
          kind: "event",
          level: "info",
          time: 1_788_120_057_903.5,
          message: "request handled",
          fields: {},
        }),
      ).not.toThrow();
      expect(consoleLog).toHaveBeenCalledTimes(1);
    } finally {
      consoleLog.mockRestore();
    }
  });

  test("prints the span path and, for warnings, the enclosing span fields", () => {
    const consoleLog = spyOn(console, "log").mockImplementation(
      () => undefined,
    );

    try {
      const transport = consoleTransport({ level: "debug", color: false });
      setTransports([transport]);
      withSpan("request", { path: "/movie" }, () => {
        logger().set({ user: "u1" });
        withSection("render", {}, () => {
          logger().info("fine");
          logger().warn("slow", { ms: 12 });
        });
      });
      const lines = consoleLog.mock.calls.map((call) => String(call[0]));
      const info = lines.find((line) => line.includes("fine"));
      const warn = lines.find((line) => line.includes("slow"));
      expect(info).toContain("request › render");
      expect(info).not.toContain("path=");
      expect(warn).toContain("ms=12");
      expect(warn).toContain('path="/movie"');
      // Fields set after the span opened are part of the context too.
      expect(warn).toContain('user="u1"');
      // The close line of the section is printed after the section's events
      // and still knows its parent.
      const close = lines.find((line) => line.includes("· render"));
      expect(close).toContain("request ");
    } finally {
      consoleLog.mockRestore();
    }
  });

  test("renders every error field as a named block after the inline fields", () => {
    const consoleLog = spyOn(console, "log").mockImplementation(
      () => undefined,
    );

    try {
      const transport = consoleTransport({ level: "debug", color: false });
      transport.emit({
        kind: "event",
        level: "error",
        time: 1_788_120_057_903,
        message: "request",
        fields: toJsonFields({
          path: "/movie",
          apiErr: new Error("api down", { cause: new Error("timeout") }),
          dbErr: "locked",
          api: { retries: 2, inner: new Error("nested") },
        }),
      });
      const line = String(consoleLog.mock.calls[0]?.[0]);
      const [head = "", ...rest] = line.split("\n");
      expect(head).toContain("path=");
      expect(head).not.toContain("apiErr=");
      const blocks = rest.join("\n");
      expect(blocks).toContain("apiErr:");
      expect(blocks).toContain("Error: api down");
      expect(blocks).toContain("caused by:");
      expect(blocks).toContain("Error: timeout");
      expect(head).toContain('dbErr="locked"');
      expect(blocks).toContain("api.inner:");
      expect(blocks).toContain("Error: nested");
      expect(head).toContain("api={ retries: 2");
      expect(head).not.toContain("inner");
    } finally {
      consoleLog.mockRestore();
    }
  });
});

describe("toJsonValue", () => {
  test("stringifies every Temporal type, nested in arrays and objects", () => {
    expect(
      toJsonValue({
        date: Temporal.PlainDate.from("2026-09-05"),
        list: [
          Temporal.PlainTime.from("18:30"),
          Temporal.Duration.from({ hours: 2 }),
          Temporal.PlainYearMonth.from("2026-09"),
        ],
        nested: {
          instant: Temporal.Instant.from("2026-09-05T16:00:00Z"),
          zoned: Temporal.ZonedDateTime.from(
            "2026-09-05T18:00:00+02:00[Europe/Bratislava]",
          ),
          dateTime: Temporal.PlainDateTime.from("2026-09-05T18:00"),
        },
      }),
    ).toEqual({
      date: "2026-09-05",
      list: ["18:30:00", "PT2H", "2026-09"],
      nested: {
        instant: "2026-09-05T16:00:00Z",
        zoned: "2026-09-05T18:00:00+02:00[Europe/Bratislava]",
        dateTime: "2026-09-05T18:00:00",
      },
    });
  });

  test("leaves primitives and null untouched, drops undefined keys", () => {
    expect(
      toJsonValue({ n: 1, s: "x", b: true, nil: null, gone: undefined }),
    ).toEqual({
      n: 1,
      s: "x",
      b: true,
      nil: null,
    });
    expect(toJsonValue(undefined)).toBeUndefined();
    expect(toJsonValue(10n)).toBe("10");
  });
});

describe("transport failures", () => {
  test("are reported on the console and never reach the caller", () => {
    const cause = new Error("console unavailable");
    const consoleError = spyOn(console, "error").mockImplementation(
      () => undefined,
    );
    setTransports([
      {
        emit: () => {
          throw cause;
        },
      },
    ]);

    try {
      expect(() => logger().info("request handled")).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith(
        "Logger transport failed",
        cause,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("error serialization", () => {
  test("a failed query never logs its bound values", () => {
    const secret = "api-token-secret";
    const error = new DrizzleQueryError(
      "insert into credentials (key, value) values (?, ?)",
      ["axiom", secret],
      new Error("SQLITE_BUSY"),
    );

    const json = JSON.stringify(toJsonValue(error));

    expect(json).not.toContain(secret);
    expect(json).toContain("insert into credentials");
    expect(json).toContain("SQLITE_BUSY");
  });

  test("keeps the cause chain and aggregate members", () => {
    const aggregate = new AggregateError(
      [new Error("first"), new Error("second")],
      "everything failed",
    );

    expect(toJsonValue(new Error("outer", { cause: aggregate }))).toMatchObject(
      {
        $error: true,
        message: "outer",
        cause: {
          $error: true,
          message: "everything failed",
          errors: [{ message: "first" }, { message: "second" }],
        },
      },
    );
  });

  test("a non-Error cause is kept as its JSON", () => {
    expect(
      toJsonValue(new Error("outer", { cause: { code: 42 } })),
    ).toMatchObject({ cause: { code: 42 } });
  });

  test("a thrown undefined is still recorded as an error", () => {
    const transport = capture();

    expect(() =>
      withSpan("request", {}, () => {
        throwValue(undefined);
      }),
    ).toThrow();

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.uncaughtErr).toMatchObject({
      message: "Non-Error value thrown",
    });
  });

  test("a thrown non-Error closes the span with a wrapped error", () => {
    const transport = capture();

    expect(() =>
      withSpan("request", {}, () => {
        throwValue({ code: 42 });
      }),
    ).toThrow();

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.uncaughtErr).toMatchObject({
      $error: true,
      message: "Non-Error value thrown",
      cause: { code: 42 },
    });
  });
});

describe("set", () => {
  test("targets the nearest owning span through transparent sections", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      withSection("render", {}, () => {
        logger().set({ status: 200 });
      });
    });

    const close = spanCloses(transport.records).find(
      (r) => r.name === "request",
    );
    expect(close?.fields.status).toBe(200);
  });

  test("a section's own handle targets the section itself", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      withSection("render", {}, (section) => {
        section.set({ parsed: 5 });
      });
    });

    const closes = spanCloses(transport.records);
    const sectionClose = closes.find((r) => r.name === "render");
    const requestClose = closes.find((r) => r.name === "request");
    expect(sectionClose?.fields.parsed).toBe(5);
    expect(requestClose?.fields.parsed).toBeUndefined();
  });

  test("warns and drops when there is no owning span", () => {
    const transport = capture();

    logger().set({ lost: true });

    const [warning] = events(transport.records);
    expect(warning?.level).toBe("warn");
    expect(warning?.fields).toEqual({ lost: true });
  });
});

describe("addCounter", () => {
  test("accumulates on every enclosing span and section", () => {
    const transport = capture();

    withSpan("job", {}, () => {
      withSpan("first", {}, () => {
        withSection("fetch", {}, () => {
          logger().addCounter("dbQueries");
          logger().addCounter("dbQueries", 2);
        });
      });
      withSpan("second", {}, () => {
        logger().addCounter("dbQueries", 4);
      });
    });

    const closes = new Map(
      spanCloses(transport.records).map((r) => [r.name, r.counters]),
    );
    expect(closes.get("first")?.dbQueries).toBe(3);
    expect(closes.get("second")?.dbQueries).toBe(4);
    expect(closes.get("job")?.dbQueries).toBe(7);
    expect(closes.get("fetch")?.dbQueries).toBe(3);
  });

  test("warns and drops when there is no span", () => {
    const transport = capture();

    logger().addCounter("dbQueries");

    expect(events(transport.records)[0]?.level).toBe("warn");
  });
});

describe("span close", () => {
  test("owning spans close at info with initial and set fields and a duration", () => {
    const transport = capture();

    withSpan("request", { path: "/" }, () => {
      logger().set({ status: 200 });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("info");
    expect(close?.owning).toBe(true);
    expect(close?.fields).toEqual({ path: "/", status: 200 });
    expect(close?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("sections close at debug with their own duration", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      withSection("parse", {}, () => undefined);
      withSection("parse", {}, () => undefined);
    });

    const sectionClose = spanCloses(transport.records).find(
      (r) => r.name === "parse",
    );
    expect(sectionClose?.level).toBe("debug");
    expect(sectionClose?.owning).toBe(false);
    expect(sectionClose?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("the span kind defaults to internal and can be set per span", () => {
    const transport = capture();

    withSpan("request", {}, { kind: "server" }, () => undefined);
    withSection("db-query", {}, { kind: "client" }, () => undefined);
    withSection("render", {}, () => undefined);

    const kinds = spanCloses(transport.records).map((r) => r.spanKind);
    expect(kinds).toEqual(["server", "client", "internal"]);
  });

  test("a root origin is inherited by every descendant span", () => {
    const transport = capture();

    withSpan("request", {}, { origin: "request" }, () => {
      withSpan("job", {}, () => {
        withSection("db-query", {}, () => undefined);
      });
    });
    withSpan("job", {}, () => {
      withSection("db-query", {}, () => undefined);
    });

    expect(spanCloses(transport.records).map((r) => r.traceOrigin)).toEqual([
      "request",
      "request",
      "request",
      undefined,
      undefined,
    ]);
  });

  test("async spans close after the promise settles", async () => {
    const transport = capture();

    await withSpan("request", {}, async () => {
      await Promise.resolve();
      logger().set({ late: true });
    });

    const [close] = spanCloses(transport.records);
    expect(close?.fields).toEqual({ late: true });
  });

  test("nested span timestamps and durations use one monotonic timeline", () => {
    const transport = capture();

    withSpan("parent", {}, () => {
      withSection("child", {}, () => undefined);
    });

    const opens = spanOpens(transport.records);
    const closes = spanCloses(transport.records);
    const parentOpen = opens.find((r) => r.name === "parent");
    const childOpen = opens.find((r) => r.name === "child");
    const parentClose = closes.find((r) => r.name === "parent");
    const childClose = closes.find((r) => r.name === "child");
    if (
      parentOpen === undefined ||
      childOpen === undefined ||
      parentClose === undefined ||
      childClose === undefined
    ) {
      throw new Error("expected nested span records");
    }

    expect(childOpen.time).toBeGreaterThanOrEqual(parentOpen.time);
    expect(childClose.time).toBeLessThanOrEqual(parentClose.time);
    expect(childClose.startTime).toBe(childOpen.time);
    expect(childOpen.time + childClose.durationMs).toBe(childClose.time);
    expect(parentOpen.time + parentClose.durationMs).toBe(parentClose.time);
  });

  test("a throwing span closes at error with the serialized error and re-throws", () => {
    const transport = capture();

    expect(() =>
      withSpan("request", {}, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.uncaughtErr).toMatchObject({ message: "boom" });
  });

  test("a rejecting async span closes at error and re-rejects", async () => {
    const transport = capture();

    let caught: unknown;
    try {
      await withSpan("request", {}, async () => {
        await Promise.resolve();
        throw new Error("boom");
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);

    const [close] = spanCloses(transport.records);
    expect(close?.level).toBe("error");
    expect(close?.fields.uncaughtErr).toMatchObject({ message: "boom" });
  });

  test("parallel sibling spans keep their fields and counters separate", async () => {
    const transport = capture();

    await withSpan("job", {}, async () => {
      await Promise.all([
        withSpan("a", {}, async () => {
          await Promise.resolve();
          logger().set({ who: "a" });
          logger().addCounter("dbQueries");
        }),
        withSpan("b", {}, async () => {
          logger().set({ who: "b" });
          await Promise.resolve();
          logger().addCounter("dbQueries", 2);
        }),
      ]);
    });

    const closes = spanCloses(transport.records);
    const fields = new Map(closes.map((r) => [r.name, r.fields]));
    expect(fields.get("a")).toEqual({ who: "a" });
    expect(fields.get("b")).toEqual({ who: "b" });
    const counters = new Map(closes.map((r) => [r.name, r.counters]));
    expect(counters.get("a")).toEqual({ dbQueries: 1 });
    expect(counters.get("b")).toEqual({ dbQueries: 2 });
    expect(counters.get("job")?.dbQueries).toBe(3);
  });
});

describe("span identity", () => {
  test("ids are OpenTelemetry-sized hex and shared between open and close", () => {
    const transport = capture();

    withSpan("request", {}, () => {
      withSection("render", {}, () => {
        logger().info("inside");
      });
    });

    const opens = spanOpens(transport.records);
    const closes = spanCloses(transport.records);
    expect(opens.map((r) => r.name)).toEqual(["request", "render"]);
    expect(closes.map((r) => r.name)).toEqual(["render", "request"]);

    const requestOpen = opens.find((r) => r.name === "request");
    const requestClose = closes.find((r) => r.name === "request");
    const renderClose = closes.find((r) => r.name === "render");
    expect(requestOpen?.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(requestOpen?.traceId).toMatch(/^[0-9a-f]{32}$/u);
    expect(requestClose?.spanId).toBe(requestOpen?.spanId ?? "");
    expect(requestOpen?.parentSpanId).toBeUndefined();
    expect(renderClose?.parentSpanId).toBe(requestOpen?.spanId ?? "");
    expect(renderClose?.traceId).toBe(requestOpen?.traceId ?? "");

    const [event] = events(transport.records);
    expect(event?.traceId).toBe(requestOpen?.traceId ?? "");
    expect(event?.spanId).toBe(renderClose?.spanId ?? "");
  });

  test("sibling spans in one trace get distinct ids but one traceId", () => {
    const transport = capture();

    withSpan("run", {}, () => {
      withSpan("a", {}, () => undefined);
      withSpan("b", {}, () => undefined);
    });

    const opens = spanOpens(transport.records);
    const ids = new Set(opens.map((r) => r.spanId));
    expect(ids.size).toBe(3);
    const traceIds = new Set(opens.map((r) => r.traceId));
    expect(traceIds.size).toBe(1);
  });
});
