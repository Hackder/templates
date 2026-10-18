import type { Context } from "hono";
import type { Version } from "../version";

// What each tab's /updates stream has emitted, and the actions waiting for
// it. An action changes state and answers 204; the change reaches the tab
// as a render on its stream. The control's loading indicator
// (`data-indicator`) ends with the answer, so the answer waits until the
// stream has emitted the change: `answerWhenEmitted(context, sessionId,
// version)`, where `version` is what the action's last change returned: a
// writer of src/state.ts, `mutateView`, or a device change
// (src/version.ts). An action that changed nothing answers at once.
//
// A stream records a version once the render it started at that version is
// written to its response (`StreamEmission.emitted`). Written means handed
// to the socket, not shown: the answer travels on its own connection, so
// the browser may handle it a moment before it has applied the render. The
// server's promise is the order of the writes.
//
// With no stream open for the tab (closed, reconnecting, not yet
// connected) nothing will emit, so the answer goes at once; a stream that
// opens later starts with a full render anyway. When the tab's last stream
// closes, everyone still waiting is answered.

interface Waiter {
  version: Version;
  resolve: () => void;
}

interface Session {
  streams: Set<Stream>;
  waiters: Set<Waiter>;
}

interface Stream {
  /** The newest version this stream has written. */
  emitted: Version;
}

/** View session id → its open streams and waiting actions. */
const sessions = new Map<string, Session>();

/** One /updates stream's side of the bookkeeping. */
export interface StreamEmission {
  /** The events rendered from the state at `version` have been written. */
  emitted(version: Version): void;
  /** The stream has ended; call exactly once, whatever ended it. */
  close(): void;
}

/** For the /updates stream of `sessionId`, when it opens. */
export function openEmission(sessionId: string): StreamEmission {
  const existing = sessions.get(sessionId);
  const session: Session = existing ?? {
    streams: new Set(),
    waiters: new Set(),
  };
  sessions.set(sessionId, session);
  const stream: Stream = { emitted: 0 };
  session.streams.add(stream);
  return {
    emitted(version) {
      stream.emitted = Math.max(stream.emitted, version);
      for (const waiter of session.waiters) {
        if (waiter.version <= stream.emitted) {
          session.waiters.delete(waiter);
          waiter.resolve();
        }
      }
    },
    close() {
      session.streams.delete(stream);
      if (session.streams.size > 0) {
        return;
      }
      for (const waiter of session.waiters) {
        waiter.resolve();
      }
      session.waiters.clear();
      sessions.delete(sessionId);
    },
  };
}

/**
 * Resolves once a stream of `sessionId` has written a render of the state
 * at `version` or later, or at once when the tab has no stream open; if its
 * last stream closes first, then.
 */
export async function emitted(
  sessionId: string,
  version: Version,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (session === undefined) {
    return;
  }
  for (const stream of session.streams) {
    if (stream.emitted >= version) {
      return;
    }
  }
  await new Promise<void>((resolve) => {
    session.waiters.add({ version, resolve });
  });
}

/**
 * An action's 204, sent once its change at `version` has been emitted to
 * the tab (see `emitted`). Only for a version the action itself produced:
 * every such change wakes this tab's stream, so a render of it follows.
 */
export async function answerWhenEmitted(
  context: Context,
  sessionId: string,
  version: Version,
): Promise<Response> {
  await emitted(sessionId, version);
  return context.body(null, 204);
}
