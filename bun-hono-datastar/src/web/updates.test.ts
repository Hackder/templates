import { expect, test } from "bun:test";
import { increment, readState } from "../state";
import { emitted } from "./emission";
import { openView } from "./session";
import { type UpdatesSender, streamUpdates } from "./updates";

// The server's promise to an action: its answer is never sent before the
// render that contains its change has been written to its tab's stream.
// A fake sender holds every write until the test releases it and logs the
// order in which writes finish and answers go out.

interface HeldWrite {
  html: string;
  release: () => void;
}

function fakeStream() {
  const log: string[] = [];
  const held: HeldWrite[] = [];
  const waiting: ((write: HeldWrite) => void)[] = [];
  let aborted = false;
  const abortListeners: (() => void)[] = [];

  const sender: UpdatesSender = {
    get aborted() {
      return aborted;
    },
    onAbort(listener) {
      abortListeners.push(listener);
    },
    async patchElements(elements) {
      const html = await elements;
      const written = Promise.withResolvers<undefined>();
      const write = {
        html,
        release: () => {
          written.resolve(undefined);
        },
      };
      const taker = waiting.shift();
      if (taker === undefined) {
        held.push(write);
      } else {
        taker(write);
      }
      await written.promise;
      log.push(`written ${html}`);
    },
    async appendElements(elements) {
      log.push(`appended ${await elements}`);
    },
  };

  return {
    sender,
    log,
    /** The next render the stream started writing. */
    nextWrite: async (): Promise<HeldWrite> => {
      const write = held.shift();
      if (write !== undefined) {
        return write;
      }
      return await new Promise<HeldWrite>((resolve) => {
        waiting.push(resolve);
      });
    },
    abort: () => {
      aborted = true;
      for (const listener of abortListeners) {
        listener();
      }
    },
  };
}

function open(sessionId: string, stream: ReturnType<typeof fakeStream>) {
  return streamUpdates(sessionId, stream.sender, {
    render: () => `count=${readState().count}`,
    signedIn: () => true,
    reload: () => "reload",
  });
}

function counterSession(): string {
  return openView({ page: "counter" }).id;
}

test("an action is answered only after the render with its change is written", async () => {
  const sessionId = counterSession();
  const stream = fakeStream();
  const running = open(sessionId, stream);

  // A render from before the change is being written when it happens.
  const before = await stream.nextWrite();
  const count = readState().count;
  expect(before.html).toBe(`count=${count}`);
  const version = increment();
  const answered = emitted(sessionId, version).then(() => {
    stream.log.push("answered");
  });
  before.release();

  // That render does not answer it; the next one, once written, does.
  const after = await stream.nextWrite();
  expect(after.html).toBe(`count=${count + 1}`);
  expect(stream.log).toEqual([`written count=${count}`]);
  after.release();
  await answered;
  expect(stream.log).toEqual([
    `written count=${count}`,
    `written count=${count + 1}`,
    "answered",
  ]);

  stream.abort();
  await running;
});

test("a stream that ends answers what waits on it", async () => {
  const sessionId = counterSession();
  const stream = fakeStream();
  const running = open(sessionId, stream);
  const first = await stream.nextWrite();

  const version = increment();
  const answered = emitted(sessionId, version);
  // The tab goes away mid-write: its stream ends, unwritten.
  stream.abort();
  first.release();
  await running;
  await answered;
  expect(stream.log).toEqual([first.html].map((html) => `written ${html}`));
});

test("a session the server does not know reloads the tab and ends", async () => {
  const stream = fakeStream();
  // An id from before a restart: no page load of this server minted it.
  await open(crypto.randomUUID(), stream);
  expect(stream.log).toEqual(["appended reload"]);
});
