import assert from "node:assert/strict";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { type ViewState, viewSessionOf } from "./session";

// A control is busy from its click until the server says its action is
// done, and that word comes over the tab's /updates stream, the same way
// as the action's result. Each click is one request with its own id: the
// client (`@busyPost` in static/script.js) sets the control's signal
// `busy.<name>` to that id and sends the name and the id in the BUSY_HEADER
// and BUSY_ID_HEADER headers. A 2xx answer only says the action was
// accepted, so the signal stays. The server runs the action, answers, and
// records the id as finished in the tab's ledger; the tab's streams write
// "these ids are done" after any render the action caused, so the spinner
// ends once the result is on the page, and also when the action changed
// nothing. The client clears a control only when it still holds one of
// those ids: a late word about an old click never ends a newer one. It
// clears the signal itself when the action failed (an error status, or
// the network after Datastar's retries).
//
// The word is lost when the tab has no stream at the time, so every
// (re)connected stream sends the whole ledger after its first render.
// Extra ids are harmless. One still running is not in the ledger and keeps
// its spinner until its own word comes. A stuck spinner on a live stream
// is a server bug, and stays visible: there is no timeout.
//
// The ids also make every busy action safe to repeat: Datastar retries a
// request whose answer the network lost, with the same id, so a request
// whose id already ran (or is running) is answered without running the
// action again, and its word is sent again.

/** The request header that names the control's busy signal. */
export const BUSY_HEADER = "Datastar-Busy";
/** The request header with the click's request id. */
export const BUSY_ID_HEADER = "Datastar-Busy-Id";

/**
 * The stream's event saying which request ids are done (data: `ids <id>
 * <id>…`); the browser's watcher of that name ends their controls' busy
 * state (static/script.js).
 */
export const BUSY_DONE_EVENT = "datastar-busy-done";

/** A name under `busy`: a plain identifier, so `$busy.<name>` works. */
export const BUSY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
/** A request id, as the client makes them (hex). */
const BUSY_ID = /^[A-Za-z0-9-]{1,64}$/u;

/**
 * How many finished request ids a tab remembers. Bounded by count, not
 * time: it only has to outlast a reconnect and Datastar's retries, which
 * a tab's next few dozen clicks do not crowd out.
 */
const LEDGER_SIZE = 50;

/** One /updates stream's side: the ids it has yet to say are done. */
interface Stream {
  pending: Set<string>;
  wake: () => void;
}

/** A view session's busy requests and its open streams. */
interface Tab {
  /** Ids of the requests whose actions are running. */
  running: Set<string>;
  /** Ids of finished requests, oldest first, at most LEDGER_SIZE. */
  finished: string[];
  streams: Set<Stream>;
}

/** By view state: a tab lives exactly as long as its view session. */
const tabs = new WeakMap<ViewState, Tab>();

function tabOf(view: ViewState): Tab {
  let tab = tabs.get(view);
  if (tab === undefined) {
    tab = { running: new Set(), finished: [], streams: new Set() };
    tabs.set(view, tab);
  }
  return tab;
}

/** Queues "`id` is done" on every open stream of the tab. */
function sayDone(tab: Tab, id: string): void {
  for (const stream of tab.streams) {
    stream.pending.add(id);
    stream.wake();
  }
}

/** How a busy request is to be handled; see `startBusy`. */
export type BusyStart =
  /** Run the action, then call `done` after its last change. */
  | { kind: "run"; done: () => void }
  /** A repeat of a request that ran or runs: answer, do not run it. */
  | { kind: "repeat" };

/**
 * A busy request `id` of the tab arrives. A new one is recorded as running
 * until its `done` is called, which adds it to the ledger and queues its
 * word on the tab's open streams; each stream writes it after the render
 * that shows the action's change. A repeat is not run again: one still
 * running is said done when it finishes, one that finished is said done
 * again now.
 */
export function startBusy(view: ViewState, id: string): BusyStart {
  const tab = tabOf(view);
  if (tab.running.has(id)) {
    return { kind: "repeat" };
  }
  if (tab.finished.includes(id)) {
    sayDone(tab, id);
    return { kind: "repeat" };
  }
  tab.running.add(id);
  let finished = false;
  return {
    kind: "run",
    done: () => {
      assert(!finished, "an action finishes once, when its handler has ended");
      finished = true;
      tab.running.delete(id);
      tab.finished.push(id);
      if (tab.finished.length > LEDGER_SIZE) {
        tab.finished.shift();
      }
      sayDone(tab, id);
    },
  };
}

/**
 * For `/actions/*`: an action sent with BUSY_HEADER and BUSY_ID_HEADER runs
 * as busy (see `startBusy`) for the tab in its `sessionid` signal, whatever
 * its outcome, and a repeat of one is answered 204 without running it. An
 * action without the headers has no control to clear.
 */
export function busyActions(): MiddlewareHandler {
  return async (context, next) => {
    const name = context.req.header(BUSY_HEADER);
    const id = context.req.header(BUSY_ID_HEADER);
    if (name === undefined && id === undefined) {
      await next();
      return undefined;
    }
    if (name === undefined || !BUSY_NAME.test(name)) {
      throw new HTTPException(400, { message: `Invalid ${BUSY_HEADER}` });
    }
    if (id === undefined || !BUSY_ID.test(id)) {
      throw new HTTPException(400, { message: `Invalid ${BUSY_ID_HEADER}` });
    }
    const { view } = await viewSessionOf(context.req);
    const start = startBusy(view, id);
    if (start.kind === "repeat") {
      return context.body(null, 204);
    }
    try {
      await next();
    } finally {
      start.done();
    }
    return undefined;
  };
}

/** One /updates stream's busy words; see `openBusy`. */
export interface BusyStream {
  /** Whether words wait to be written. */
  pending(): boolean;
  /**
   * The ids to say are done now (null: none). Take them before rendering
   * and write them after that render: each was queued after its action's
   * last change, so that render shows it. One queued during the render
   * waits for the next round, which a change that came with it renders
   * first.
   */
  take(): string[] | null;
  /** The stream has ended; call exactly once. */
  close(): void;
}

/**
 * For the /updates stream of the tab showing `view`, when it opens. It
 * starts with the whole ledger, so its first render is followed by the
 * words a stream before it may have lost. `wake` is called when a word is
 * queued.
 */
export function openBusy(view: ViewState, wake: () => void): BusyStream {
  const tab = tabOf(view);
  const stream: Stream = { pending: new Set(tab.finished), wake };
  tab.streams.add(stream);
  return {
    pending: () => stream.pending.size > 0,
    take() {
      if (stream.pending.size === 0) {
        return null;
      }
      const ids = [...stream.pending];
      stream.pending.clear();
      return ids;
    },
    close() {
      tab.streams.delete(stream);
    },
  };
}
