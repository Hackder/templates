// Globals the flame-graph script publishes for Datastar expressions in the
// server-rendered markup to call.

declare global {
  interface Window {
    /**
     * Re-applies pan/zoom and redraws the axis. Called from the flame
     * viewport's `data-effect`, whose arguments bake the trace id and total
     * duration into the attribute so Datastar re-runs it exactly when a
     * server patch changes either. Optional because the effect can fire
     * before the module that defines it has loaded.
     */
    logviewFlame?: (vp: HTMLElement, traceId: string, totalMs: number) => void;
  }
}

export {};
