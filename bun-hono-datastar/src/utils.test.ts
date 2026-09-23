import { describe, expect, jest, test } from "bun:test";
import { createLimitedFetch } from "./utils";
import assert, { AssertionError } from "node:assert/strict";

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("createLimitedFetch", () => {
  test("limits fetches to concurrency: 1 and rps: 1", async () => {
    // oxlint-disable-next-line local/no-date -- this test fakes Date itself to drive the rate limiter
    const now = Date.UTC(2026, 0, 1);
    jest.useFakeTimers({ now });

    const fetchStarts: number[] = [];
    const pendingFetches: (() => void)[] = [];
    let activeFetches = 0;
    let maxActiveFetches = 0;

    function testFetch(): Promise<Response> {
      // oxlint-disable-next-line local/no-date -- reads the faked clock installed above
      fetchStarts.push(Date.now());
      activeFetches++;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);

      return new Promise<Response>((resolve) => {
        pendingFetches.push(() => {
          activeFetches--;
          resolve(new Response("ok"));
        });
      });
    }

    try {
      const limitedFetch = createLimitedFetch({
        concurrency: 1,
        rps: 1,
        fetchFn: testFetch,
      });

      const first = limitedFetch("https://example.com/1");
      const second = limitedFetch("https://example.com/2");

      await flushMicrotasks();
      expect(fetchStarts).toEqual([now]);
      expect(maxActiveFetches).toBe(1);

      pendingFetches.shift()?.();
      await first;
      await flushMicrotasks();
      jest.advanceTimersByTime(999);
      await flushMicrotasks();
      expect(fetchStarts).toEqual([now]);

      jest.advanceTimersByTime(1);
      await flushMicrotasks();
      expect(fetchStarts).toEqual([now, now + 1000]);
      expect(maxActiveFetches).toBe(1);

      pendingFetches.shift()?.();
      await second;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("assertions work as expected", () => {
  test("a failing assert throws AssertionError with the message and diff", () => {
    let caught: unknown;
    try {
      assert.equal(1, 2, "different numbers");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AssertionError);
    assert(caught instanceof AssertionError);
    expect(caught.message).toContain("different numbers");
    expect(caught.actual).toBe(1);
    expect(caught.expected).toBe(2);
    expect(caught.operator).toBe("strictEqual");
  });

  test("a passing assert returns without throwing", () => {
    expect(() => assert.equal(1, 1)).not.toThrow();
    expect(() => assert(true)).not.toThrow();
  });

  test("equal is strict: no type coercion", () => {
    expect(() => assert.equal(1, "1")).toThrow(AssertionError);
    expect(() => assert.notEqual(1, "1")).not.toThrow();
  });

  test("deepEqual is strict: compares prototypes and types", () => {
    expect(() => assert.deepEqual({ a: 1 }, { a: 1 })).not.toThrow();
    expect(() => assert.deepEqual({ a: 1 }, { a: "1" })).toThrow(
      AssertionError,
    );
    expect(() => assert.deepEqual([1], { 0: 1 })).toThrow(AssertionError);
  });

  test("assert.ok rejects a missing object", () => {
    const found = [{ id: 1 }].find((item) => item.id === 2);
    expect(() => assert.ok(found)).toThrow(AssertionError);
  });

  test("assert.fail always throws", () => {
    expect(() => assert.fail("boom")).toThrow(
      new AssertionError({ message: "boom" }),
    );
  });
});
