import { expect, test } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { ViewSessions, knownView, openView } from "./session";

// Only a page load starts a view session; an id the server does not know
// stays unknown (the tab reloads), and a session with an open stream is
// never dropped by the LRU.

const COUNTER = { page: "counter" } as const;

test("an id the server does not know stays unknown; its actions get 410", () => {
  const sessions = new ViewSessions(10);
  const id = crypto.randomUUID();
  expect(sessions.find(id)).toBeUndefined();
  expect(sessions.hold(id)).toBeUndefined();
  // Looking did not create it.
  expect(sessions.find(id)).toBeUndefined();

  let status: number | null = null;
  try {
    knownView(crypto.randomUUID());
  } catch (error) {
    if (error instanceof HTTPException) {
      status = error.status;
    }
  }
  expect(status).toBe(410);
  const session = openView(COUNTER);
  expect(knownView(session.id).view).toBe(session.view);
});

test("idle sessions in use stay; the least recently used are dropped", () => {
  const sessions = new ViewSessions(2);
  const used = sessions.open(COUNTER);
  const idle = sessions.open(COUNTER);
  // Fills `active`; the next open swaps it to `old`.
  sessions.open(COUNTER);
  // Promoted back on use.
  expect(sessions.find(used.id)).toBeDefined();
  sessions.open(COUNTER);
  sessions.open(COUNTER);
  expect(sessions.find(used.id)).toBeDefined();
  expect(sessions.find(idle.id)).toBeUndefined();
});

test("a session with an open stream outlives any number of page loads", () => {
  const sessions = new ViewSessions(2);
  const streamed = sessions.open(COUNTER);
  const held = sessions.hold(streamed.id);
  expect(held?.session.view).toBe(streamed.view);
  for (let i = 0; i < 10; i++) {
    sessions.open(COUNTER);
  }
  expect(sessions.find(streamed.id)?.view).toBe(streamed.view);

  // A reconnect overlapping the stream it replaces shares the hold.
  const second = sessions.hold(streamed.id);
  held?.release();
  for (let i = 0; i < 10; i++) {
    sessions.open(COUNTER);
  }
  expect(sessions.find(streamed.id)?.view).toBe(streamed.view);

  // Its last stream ended: idle again, the most recent entry of the LRU,
  // and dropped once enough newer page loads went by.
  second?.release();
  expect(sessions.find(streamed.id)?.view).toBe(streamed.view);
  for (let i = 0; i < 4; i++) {
    sessions.open(COUNTER);
  }
  expect(sessions.find(streamed.id)).toBeUndefined();
});
