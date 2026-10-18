import { expect, test } from "bun:test";
import {
  createLimiter,
  recordAttempt,
  recordSuccess,
  retryAfter,
} from "./limiter";

const start = Temporal.Instant.from("2026-10-15T08:00:00Z");

function limiter() {
  return createLimiter({
    freeAttempts: 3,
    baseDelay: Temporal.Duration.from({ seconds: 1 }),
    maxDelay: Temporal.Duration.from({ seconds: 10 }),
    forgetAfter: Temporal.Duration.from({ hours: 1 }),
  });
}

function waitMs(
  l: ReturnType<typeof limiter>,
  at: Temporal.Instant,
): number | null {
  return retryAfter(l, "ip", at)?.total("milliseconds") ?? null;
}

test("free attempts go through, then each failure doubles the wait up to the cap", () => {
  const l = limiter();
  for (let i = 0; i < 2; i++) {
    recordAttempt(l, "ip", start);
    expect(waitMs(l, start)).toBeNull();
  }
  recordAttempt(l, "ip", start);
  expect(waitMs(l, start)).toBe(1000);
  recordAttempt(l, "ip", start);
  expect(waitMs(l, start)).toBe(2000);
  recordAttempt(l, "ip", start);
  expect(waitMs(l, start)).toBe(4000);
  for (let i = 0; i < 5; i++) {
    recordAttempt(l, "ip", start);
  }
  expect(waitMs(l, start)).toBe(10_000);
  expect(waitMs(l, start.add({ seconds: 10 }))).toBeNull();
});

test("keys are counted apart", () => {
  const l = limiter();
  for (let i = 0; i < 4; i++) {
    recordAttempt(l, "ip", start);
  }
  expect(waitMs(l, start)).not.toBeNull();
  expect(retryAfter(l, "other", start)).toBeNull();
});

test("a success or a quiet hour forgets the failures", () => {
  const l = limiter();
  for (let i = 0; i < 4; i++) {
    recordAttempt(l, "ip", start);
  }
  recordSuccess(l, "ip");
  expect(waitMs(l, start)).toBeNull();

  for (let i = 0; i < 4; i++) {
    recordAttempt(l, "ip", start);
  }
  const later = start.add({ hours: 1 });
  expect(waitMs(l, later)).toBeNull();
  // Forgotten, not just waited out: the next failure is free again.
  recordAttempt(l, "ip", later);
  expect(waitMs(l, later)).toBeNull();
  expect(l.strikes.size).toBe(1);
});
