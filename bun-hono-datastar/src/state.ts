// The app's shared state and its only writer. Everything else reads it
// (`readState`) or asks for a change through the functions below; every
// change is one synchronous mutation that notifies the listeners, which
// are the tabs' /updates streams. Kept in memory: a real app loads it on boot and writes changes
// to the database after the mutation, never from inside it.

export interface State {
  count: number;
}

const state: State = { count: 0 };

/** The current state; read it, never change it. */
export function readState(): Readonly<State> {
  return state;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called after every mutation; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function mutate(fn: (state: State) => void): void {
  fn(state);
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Adds one to the count. A plain increment, not safe to repeat by itself:
 * its action runs under a busy request id (src/web/busy.ts), which keeps a
 * retried request from running it twice.
 */
export function increment(): void {
  mutate((s) => {
    s.count += 1;
  });
}
