import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod/v4";
import { datastarSse, readSignalsRequired } from "../../src/datastar";
import { AppView, Shell } from "./page";
import { mutateView, store, subscribe, view } from "./state";

export function createApp(logPath: string): Hono {
  const app = new Hono();

  function appState() {
    return {
      store,
      view,
      logPath,
      now: Temporal.Now.instant().epochMilliseconds,
    };
  }

  // The vendored Datastar bundle lives in the main app's static dir.
  app.use("/static/*", serveStatic({ root: "./" }));
  app.use(
    "/assets/*",
    serveStatic({
      root: "./tools/logview",
      rewriteRequestPath: (path) => path.replace(/^\/assets/u, "/static"),
    }),
  );

  app.get("/", (c) => {
    return c.html(
      <Shell>
        <AppView {...appState()} />
      </Shell>,
    );
  });

  app.get("/updates", (c) => {
    return datastarSse(c, async (sender) => {
      let dirty = true;
      let wake: (() => void) | undefined;

      const unsubscribe = subscribe(() => {
        dirty = true;
        wake?.();
      });
      sender.onAbort(() => {
        wake?.();
      });

      try {
        while (!sender.aborted) {
          if (dirty) {
            dirty = false;
            await sender.patchElements(<AppView {...appState()} />);
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
      } finally {
        unsubscribe();
      }
    });
  });

  // Selecting a trace also selects its root (request) span so the inspector
  // shows something useful without a second click.
  app.post("/actions/select-trace/:id", (c) => {
    const id = c.req.param("id");
    mutateView((v) => {
      v.follow = false;
      v.selectedTraceId = id;
      v.selectedSpanId = store.traces.get(id)?.roots[0]?.id;
      v.selectedEventSeq = undefined;
      v.focusedSpanId = undefined;
    });
    return c.body(null, 204);
  });

  // Selects an event (its time is marked in the flame graph) and jumps to
  // its span. Clicking the selected event again clears the marker.
  app.post("/actions/select-event/:seq/:spanId", (c) => {
    const seq = z.coerce.number().int().parse(c.req.param("seq"));
    const spanId = c.req.param("spanId");
    mutateView((v) => {
      if (v.selectedEventSeq === seq) {
        v.selectedEventSeq = undefined;
        return;
      }
      v.selectedEventSeq = seq;
      if (spanId !== "none") {
        v.selectedSpanId = spanId;
      }
    });
    return c.body(null, 204);
  });

  app.post("/actions/select-span/:id", (c) => {
    const id = c.req.param("id");
    mutateView((v) => {
      if (id === "none" || v.selectedSpanId === id) {
        v.selectedSpanId = undefined;
      } else {
        v.selectedSpanId = id;
      }
    });
    return c.body(null, 204);
  });

  // Focus the flame graph on one span's branch; "none" or the same id again
  // clears it. Focusing also selects the span: a double-click on a bar fires
  // two single clicks first, which toggle the selection back and forth, so
  // the final state is pinned here rather than left to the click parity.
  app.post("/actions/focus-span/:id", (c) => {
    const id = c.req.param("id");
    mutateView((v) => {
      if (id === "none" || v.focusedSpanId === id) {
        v.focusedSpanId = undefined;
      } else {
        v.focusedSpanId = id;
      }
      if (id !== "none") {
        v.selectedSpanId = id;
      }
    });
    return c.body(null, 204);
  });

  app.post("/actions/follow", (c) => {
    mutateView((v) => {
      v.follow = !v.follow;
      if (v.follow) {
        v.selectedTraceId = undefined;
        v.selectedSpanId = undefined;
        v.selectedEventSeq = undefined;
        v.focusedSpanId = undefined;
      }
    });
    return c.body(null, 204);
  });

  const levelParam = z.enum(["debug", "info", "warn", "error"]);
  app.post("/actions/min-level/:level", (c) => {
    const level = levelParam.parse(c.req.param("level"));
    mutateView((v) => {
      v.minLevel = level;
    });
    return c.body(null, 204);
  });

  const filterSignals = z.object({ filter: z.string().catch("") });
  app.post("/actions/filter", async (c) => {
    const signals = await readSignalsRequired(c.req, filterSignals);
    mutateView((v) => {
      v.filter = signals.filter;
    });
    return c.body(null, 204);
  });

  const traceFilterSignals = z.object({ tracefilter: z.string().catch("") });
  app.post("/actions/trace-filter", async (c) => {
    const signals = await readSignalsRequired(c.req, traceFilterSignals);
    mutateView((v) => {
      v.traceFilter = signals.tracefilter;
    });
    return c.body(null, 204);
  });

  return app;
}
