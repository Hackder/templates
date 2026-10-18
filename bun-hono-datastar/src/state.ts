import { type Version, advanceVersion } from "./version";

// The app's shared state and its only writer. Everything else reads it
// (`readState`) or asks for a change through the functions below; every
// change is one synchronous mutation that advances the version
// (src/version.ts) and notifies the listeners, which are the tabs' /updates
// streams. Kept in memory: a real app loads it on boot and writes changes
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

function mutate(fn: (state: State) => void): Version {
  fn(state);
  const version = advanceVersion();
  for (const listener of listeners) {
    listener();
  }
  return version;
}

/**
 * Adds one to the count. Like every writer here, returns the change's
 * version, which the action that asked for it waits to see written to its
 * tab (src/web/emission.ts).
 */
export function increment(): Version {
  return mutate((s) => {
    s.count += 1;
  });
}
