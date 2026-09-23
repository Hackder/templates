import { createStore, type Level, type Store } from "./model";

// Single global view state, mikrotik-topology style but without sessions: this
// is a one-person internal tool, so every open tab mirrors the same state.

export interface ViewState {
  /** Ignored while `follow` is on; then the newest trace is shown. */
  selectedTraceId: string | undefined;
  selectedSpanId: string | undefined;
  /** Seq of the selected event; its time is marked in the flame graph. */
  selectedEventSeq: number | undefined;
  /** Flame graph shows only this span's ancestor path and subtree. */
  focusedSpanId: string | undefined;
  follow: boolean;
  minLevel: Level;
  /** Substring filter over the events log. */
  filter: string;
  /** Substring filter over the traces list. */
  traceFilter: string;
}

export const view: ViewState = {
  selectedTraceId: undefined,
  selectedSpanId: undefined,
  selectedEventSeq: undefined,
  focusedSpanId: undefined,
  follow: true,
  minLevel: "debug",
  filter: "",
  traceFilter: "",
};

export let store: Store = createStore();

export function resetStore(): void {
  store = createStore();
  view.selectedTraceId = undefined;
  view.selectedSpanId = undefined;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function mutateView(fn: (state: ViewState) => void): void {
  fn(view);
  notify();
}
