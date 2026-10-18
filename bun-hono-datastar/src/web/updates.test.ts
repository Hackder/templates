import { expect, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  BUSY_DONE_EVENT,
  BUSY_HEADER,
  BUSY_ID_HEADER,
  busyActions,
  startBusy,
} from "./busy";
import { finishedBusy } from "../../static/busy";
import { increment, readState } from "../state";
import { type ViewSession, openView } from "./session";
import { type UpdatesSender, streamUpdates } from "./updates";

// The server's promise to a busy control: the word that its request is
// done is written to its tab's stream after the render that shows its
// action's change, never before, and only to that tab. A fake sender holds every
// write until the test releases it, so the test steps through the writes
// in the order the stream makes them.

interface HeldWrite {
  text: string;
  release: () => void;
}

function fakeStream() {
  const held: HeldWrite[] = [];
  const waiting: ((write: HeldWrite) => void)[] = [];
  let aborted = false;
  const abortListeners: (() => void)[] = [];

  async function write(text: string): Promise<void> {
    const written = Promise.withResolvers<undefined>();
    const entry = {
      text,
      release: () => {
        written.resolve(undefined);
      },
    };
    const taker = waiting.shift();
    if (taker === undefined) {
      held.push(entry);
    } else {
      taker(entry);
    }
    await written.promise;
  }

  const sender: UpdatesSender = {
    get aborted() {
      return aborted;
    },
    onAbort(listener) {
      abortListeners.push(listener);
    },
    async patchElements(elements) {
      await write(await elements);
    },
    async appendElements(elements) {
      await write(`appended ${await elements}`);
    },
    async watcherEvent(event, args) {
      expect(event).toBe(BUSY_DONE_EVENT);
      await write(`done ${args.ids ?? ""}`);
    },
  };

  /** The next write the stream started. */
  async function nextWrite(): Promise<HeldWrite> {
    const next = held.shift();
    if (next !== undefined) {
      return next;
    }
    return await new Promise<HeldWrite>((resolve) => {
      waiting.push(resolve);
    });
  }

  return {
    sender,
    nextWrite,
    /** Takes the next write, checks it and lets it finish. */
    written: async (text: string): Promise<void> => {
      const next = await nextWrite();
      expect(next.text).toBe(text);
      next.release();
    },
    abort: () => {
      aborted = true;
      for (const listener of abortListeners) {
        listener();
      }
    },
  };
}

type FakeStream = ReturnType<typeof fakeStream>;

function open(session: ViewSession, stream: FakeStream) {
  return streamUpdates(session.id, stream.sender, {
    render: () => page(),
    signedIn: () => true,
    reload: () => "reload",
  });
}

/** What the page shows now; the count is shared, so tests read it. */
function page(): string {
  return `count=${readState().count}`;
}

function counterSession(): ViewSession {
  return openView({ page: "counter" });
}

/** Starts busy request `id`; returns its `done`. */
function run(session: ViewSession, id: string): () => void {
  const start = startBusy(session.view, id);
  if (start.kind !== "run") {
    throw new Error(`${id} was already started`);
  }
  return start.done;
}

test("a busy control is cleared after the render with its action's change", async () => {
  const session = counterSession();
  const stream = fakeStream();
  const running = open(session, stream);

  // A render from before the action is being written when it runs.
  const before = await stream.nextWrite();
  expect(before.text).toBe(page());
  const done = run(session, "r1");
  increment();
  done();
  before.release();

  // That render does not say it is done; the one with the change, once
  // written, does.
  await stream.written(page());
  await stream.written("done r1");

  stream.abort();
  await running;
});

test("an action that changed nothing is said done too, and only on its tab", async () => {
  const mine = counterSession();
  const other = counterSession();
  const myStream = fakeStream();
  const otherStream = fakeStream();
  const runningMine = open(mine, myStream);
  const runningOther = open(other, otherStream);
  await myStream.written(page());
  await otherStream.written(page());

  run(mine, "r1")();
  await myStream.written("done r1");

  // Had the other tab been sent the word, it would come before this
  // render of the change.
  increment();
  await otherStream.written(page());
  await myStream.written(page());

  myStream.abort();
  otherStream.abort();
  await Promise.all([runningMine, runningOther]);
});

test("a (re)connected stream repeats the tab's finished requests after its first render", async () => {
  const session = counterSession();
  const first = fakeStream();
  const runningFirst = open(session, first);
  await first.written(page());
  // Written, but the connection dropped before the tab read it.
  run(session, "lost")();
  await first.written("done lost");
  first.abort();
  await runningFirst;
  // Finished while the tab had no stream.
  run(session, "unseen")();
  // Still running across the reconnect.
  const done = run(session, "running");

  const second = fakeStream();
  const runningSecond = open(session, second);
  await second.written(page());
  await second.written("done lost unseen");
  // The one still running is said done when it is.
  done();
  await second.written("done running");

  second.abort();
  await runningSecond;
});

test("a busy action runs once per request id, retries included, and is said done even when it fails", async () => {
  const session = counterSession();
  const stream = fakeStream();
  const running = open(session, stream);
  await stream.written(page());

  let runs = 0;
  const release = Promise.withResolvers<undefined>();
  const app = new Hono();
  app.use("/actions/*", busyActions());
  app.post("/actions/increment", (context) => {
    runs++;
    increment();
    return context.body(null, 204);
  });
  app.post("/actions/slow", async (context) => {
    runs++;
    await release.promise;
    return context.body(null, 204);
  });
  app.post("/actions/fail", () => {
    runs++;
    throw new HTTPException(409, { message: "Refused" });
  });
  async function send(
    path: string,
    { name, id }: { name: string; id: string },
  ) {
    const response = await app.request(path, {
      method: "POST",
      headers: { [BUSY_HEADER]: name, [BUSY_ID_HEADER]: id },
      body: JSON.stringify({ sessionid: session.id }),
    });
    return response.status;
  }

  const count = readState().count;
  expect(await send("/actions/increment", { name: "inc", id: "a" })).toBe(204);
  await stream.written(`count=${count + 1}`);
  await stream.written("done a");
  // A retry whose first answer was lost: not run again, said done again.
  expect(await send("/actions/increment", { name: "inc", id: "a" })).toBe(204);
  await stream.written("done a");
  expect(runs).toBe(1);
  expect(readState().count).toBe(count + 1);

  // A retry while the first is still running: not run again either.
  const slow = send("/actions/slow", { name: "slow", id: "b" });
  expect(await send("/actions/slow", { name: "slow", id: "b" })).toBe(204);
  expect(runs).toBe(2);
  release.resolve(undefined);
  expect(await slow).toBe(204);
  await stream.written("done b");

  expect(await send("/actions/fail", { name: "fail", id: "c" })).toBe(409);
  await stream.written("done c");

  // Not a name `$busy.<name>` can read, or no id: refused.
  expect(await send("/actions/increment", { name: "x.y", id: "d" })).toBe(400);
  expect(await send("/actions/increment", { name: "inc", id: "" })).toBe(400);
  expect(runs).toBe(3);

  stream.abort();
  await running;
});

test("the word that requests are done ends only the controls that still hold them", () => {
  // `revoke` was clicked again since: its newer request is still busy.
  expect(
    finishedBusy({ increment: "a", revoke: "new", other: "c" }, ["a", "old"]),
  ).toEqual(["increment"]);
  expect(finishedBusy({}, ["a"])).toEqual([]);
  expect(finishedBusy(undefined, ["a"])).toEqual([]);
});

test("a session the server does not know reloads the tab and ends", async () => {
  const stream = fakeStream();
  // An id from before a restart: no page load of this server minted it.
  const running = streamUpdates(crypto.randomUUID(), stream.sender, {
    render: () => "page",
    signedIn: () => true,
    reload: () => "reload",
  });
  await stream.written("appended reload");
  await running;
});
