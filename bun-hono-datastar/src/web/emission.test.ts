import { expect, test } from "bun:test";
import { emitted, openEmission } from "./emission";

// An action answers once its change has been emitted to its tab's stream,
// at once when the tab has no stream, and never later than that stream's
// end: no waiter outlives the streams it waits on.

/** Whether `promise` has settled once every pending callback has run. */
async function hasSettled(promise: Promise<void>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  // A macrotask runs only after every queued microtask; settling here
  // involves no timers or I/O.
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  return settled;
}

test("with no stream open there is nothing to wait for", async () => {
  expect(await hasSettled(emitted(crypto.randomUUID(), 5))).toBe(true);
});

test("waits until a render at the version or later is written", async () => {
  const sessionId = crypto.randomUUID();
  const stream = openEmission(sessionId);
  const answer = emitted(sessionId, 5);
  expect(await hasSettled(answer)).toBe(false);
  stream.emitted(4);
  expect(await hasSettled(answer)).toBe(false);
  stream.emitted(6);
  expect(await hasSettled(answer)).toBe(true);
  // Already emitted: answered at once.
  expect(await hasSettled(emitted(sessionId, 6))).toBe(true);
  stream.close();
});

test("another tab's renders answer nothing", async () => {
  const mine = crypto.randomUUID();
  const stream = openEmission(mine);
  const other = openEmission(crypto.randomUUID());
  const answer = emitted(mine, 3);
  other.emitted(10);
  expect(await hasSettled(answer)).toBe(false);
  stream.emitted(3);
  expect(await hasSettled(answer)).toBe(true);
  stream.close();
  other.close();
});

test("the tab's last stream closing answers every waiter", async () => {
  const sessionId = crypto.randomUUID();
  // A reconnect can overlap: the old stream ends after the new one opened.
  const old = openEmission(sessionId);
  const current = openEmission(sessionId);
  const answer = emitted(sessionId, 7);
  old.close();
  expect(await hasSettled(answer)).toBe(false);
  current.close();
  expect(await hasSettled(answer)).toBe(true);
  // And the tab is forgotten: nothing left to wait on.
  expect(await hasSettled(emitted(sessionId, 8))).toBe(true);
});
