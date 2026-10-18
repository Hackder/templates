import assert from "node:assert/strict";
import type { HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod/v4";
import { readSignalsRequired } from "../datastar";
import { type Version, advanceVersion } from "../version";

// Per-session UI state. A view session is one browser tab: the page load
// mints an id, and every action and the /updates stream carry it as a
// Datastar signal, so two tabs keep their own UI state. This is UI state
// only; the shared state lives in src/state.ts. Knowing a view session id
// grants nothing.

/** Which page the tab shows; set by the route that loaded it. */
export type Page = "counter";

/** What one tab shows. Add a page's UI state (an open form, a filter) here. */
export interface ViewState {
  page: Page;
}

/** What a page load starts its view session from. */
export interface ViewSeed {
  page: Page;
}

/** A view session the server knows: the tab's id and its state. */
export interface ViewSession {
  id: string;
  view: ViewState;
}

/** An open stream's hold on its view session; see `ViewSessions.hold`. */
export interface HeldView {
  session: ViewSession;
  /** The stream has ended; call exactly once. */
  release: () => void;
}

/**
 * Every view session the server knows. Only a page load creates one
 * (`open`), from its route; nothing else ever makes view state up. An id
 * the server does not know (it restarted since the page loaded, or forgot
 * an idle tab) is a stale tab, and the tab reloads, which starts a fresh
 * session the same way. Re-seeding from the stream instead would be a
 * second seeding path for state that is not durable.
 *
 * Bounded memory without timers: idle sessions sit in a hashmap-swap LRU.
 * When `active` fills up it becomes `old` and a fresh map takes over;
 * sessions still in use are promoted back on access, everything else is
 * dropped with the next swap. A session with an open stream is not idle:
 * it is held outside the LRU until its last stream ends, so the tab that
 * shows it is never left rendering from a session the server forgot. Held
 * sessions are bounded by the open streams.
 */
export class ViewSessions {
  readonly #capacity: number;
  #active = new Map<string, ViewState>();
  #old = new Map<string, ViewState>();
  readonly #held = new Map<string, { view: ViewState; streams: number }>();

  public constructor(capacity: number) {
    this.#capacity = capacity;
  }

  /** A page load's new view session. */
  public open(seed: ViewSeed): ViewSession {
    const id = crypto.randomUUID();
    const view: ViewState = { page: seed.page };
    this.#remember(id, view);
    return { id, view };
  }

  /** The session, if the server knows it; marks it as recently used. */
  public find(id: string): ViewSession | undefined {
    const view =
      this.#held.get(id)?.view ?? this.#active.get(id) ?? this.#promote(id);
    return view === undefined ? undefined : { id, view };
  }

  /**
   * For a stream, when it opens: keeps its session out of the LRU until
   * the hold is released, so no number of other page loads drops it
   * meanwhile. Several streams of one tab (a reconnect overlapping the
   * stream it replaces) share the hold.
   */
  public hold(id: string): HeldView | undefined {
    let entry = this.#held.get(id);
    if (entry === undefined) {
      const view = this.#active.get(id) ?? this.#old.get(id);
      if (view === undefined) {
        return undefined;
      }
      this.#active.delete(id);
      this.#old.delete(id);
      entry = { view, streams: 0 };
      this.#held.set(id, entry);
    }
    entry.streams += 1;
    const held = entry;
    let released = false;
    return {
      session: { id, view: held.view },
      release: () => {
        assert(!released, "a stream releases its hold once, when it ends");
        released = true;
        held.streams -= 1;
        if (held.streams === 0) {
          // Idle again: back into the LRU as its most recent entry.
          this.#held.delete(id);
          this.#remember(id, held.view);
        }
      },
    };
  }

  #promote(id: string): ViewState | undefined {
    const view = this.#old.get(id);
    if (view !== undefined) {
      this.#old.delete(id);
      this.#remember(id, view);
    }
    return view;
  }

  #remember(id: string, view: ViewState): void {
    if (this.#active.size >= this.#capacity) {
      this.#old = this.#active;
      this.#active = new Map();
    }
    this.#active.set(id, view);
  }
}

const viewSessions = new ViewSessions(1000);

/** A page load's new view session, showing `seed.page`. */
export function openView(seed: ViewSeed): ViewSession {
  return viewSessions.open(seed);
}

/** See `ViewSessions.hold`. */
export function holdView(sessionId: string): HeldView | undefined {
  return viewSessions.hold(sessionId);
}

/**
 * The view session an action came from. One the server does not know is
 * refused with 410 Gone, changing nothing: the tab is stale, and
 * static/script.js reloads it, as its stream does.
 */
export function knownView(sessionId: string): ViewSession {
  const session = viewSessions.find(sessionId);
  if (session === undefined) {
    throw new HTTPException(410, {
      message: "This tab's view session is gone; reload the page",
    });
  }
  return session;
}

type Listener = () => void;
const listeners = new Map<Listener, string>();

/** Notified when this session's view state changes. */
export function subscribeView(
  sessionId: string,
  listener: Listener,
): () => void {
  listeners.set(listener, sessionId);
  return () => listeners.delete(listener);
}

/**
 * The only way view state changes; re-renders just that session. Returns
 * the change's version (src/version.ts), which the action that made it
 * waits to see written to the tab (./emission).
 */
export function mutateView(
  session: ViewSession,
  fn: (view: ViewState) => void,
): Version {
  fn(session.view);
  const version = advanceVersion();
  for (const [listener, id] of listeners) {
    if (id === session.id) {
      listener();
    }
  }
  return version;
}

export const sessionSignals = z.object({ sessionid: z.string().min(1) });

/**
 * The session id every action and the stream carry as a signal, for an
 * action that does not touch view state (it only answers once the tab's
 * stream has emitted its change). One that does uses `viewSessionOf`.
 */
export async function sessionOf(req: HonoRequest): Promise<string> {
  return (await readSignalsRequired(req, sessionSignals)).sessionid;
}

/** The view session an action came from; see `knownView`. */
export async function viewSessionOf(req: HonoRequest): Promise<ViewSession> {
  return knownView(await sessionOf(req));
}
