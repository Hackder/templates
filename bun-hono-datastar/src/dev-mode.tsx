import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { PropsWithChildren } from "hono/jsx";
import { flushLogger, logger } from "./logger";
import { Icon, type IconKind } from "./web/components/icon";

// Namespaces the dev overlay's localStorage entries (tab position, panel
// geometry). Change it per project so two apps sharing a localhost port do not
// fight over each other's layout.
const DEV_UI_PERSIST_KEY = "bun-hono-datastar";

const generation = crypto.randomUUID();
const startedAt = Temporal.Now.instant().toString();

// The overlay is deliberately plain: the popover tokens, sharp corners, no
// animation, so it sits on top of any page without competing with its design.
interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div class="flex items-baseline gap-2 overflow-hidden">
      <span class="text-muted-foreground w-12 shrink-0">{label}</span>
      <span class="text-popover-foreground truncate">{value}</span>
    </div>
  );
}

interface DevButtonProps {
  icon: IconKind;
  label: string;
  /** Datastar expression run on click, e.g. `@post('/dev/reset')`. */
  action: string;
  /**
   * Signal name driven by `data-indicator`. While the action's request is in
   * flight the button is covered by a spinner instead of being replaced, so the
   * row does not reflow.
   */
  indicator: string;
}

export function DevButton({ icon, label, action, indicator }: DevButtonProps) {
  return (
    <button
      type="button"
      class="border-input bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground text-2xs relative flex cursor-pointer items-center gap-1.5 border px-1.5 py-1"
      data-on:click={action}
      data-indicator={indicator}
    >
      <Icon icon={icon} class="text-xs" />
      <span>{label}</span>
      {/* Hidden until Datastar runs; `hidden` (preflight makes it
          !important) is dropped while the indicator is on. */}
      <span
        class="bg-card absolute inset-0 flex items-center justify-center"
        hidden
        data-attr:hidden={`!$${indicator}`}
      >
        <Icon icon="circle-notch" class="animate-spin text-xs" />
      </span>
    </button>
  );
}

/** `children` are page-specific tools, rendered in their own panel section. */
export function DevMode({ children }: PropsWithChildren) {
  return (
    <div
      id="dev-ui"
      data-dev-ui-key={DEV_UI_PERSIST_KEY}
      data-hotreload={`/hot-reload?generation=${generation}`}
      class="text-popover-foreground pointer-events-none fixed inset-0 z-2147483647 font-mono text-xs"
    >
      {/* Collapsed state: a single icon that reports connection health. Drag it
          to any edge; a click opens the panel. */}
      <button
        type="button"
        id="dev-ui-tab"
        class="border-input bg-popover text-muted-foreground hover:text-foreground pointer-events-auto absolute flex size-7 cursor-grab touch-none items-center justify-center border"
        aria-label="Toggle dev tools"
        /* Position is an inline style dev-mode.js writes on load, and the
           server markup has none. A page patch morphs the whole body and
           strips attributes the incoming element lacks, so without this the
           tab jumps to the container's origin on every Datastar navigation. */
        data-preserve-attr="style"
      >
        <Icon icon="lightning" class="text-sm" data-show="!$hotreloading" />
        <Icon
          icon="plugs"
          class="text-warning text-sm"
          hidden
          data-attr:hidden="!$hotreloading"
        />
      </button>

      <section
        id="dev-ui-panel"
        class="border-input bg-popover pointer-events-auto absolute hidden flex-col border"
        /* Geometry and open/closed state both live in this inline style
           (dev-mode.js; its display beats the `hidden` class), so a morph
           must not reset it to the collapsed server default. */
        data-preserve-attr="style"
      >
        <header
          id="dev-ui-drag"
          class="text-muted-foreground text-2xs flex cursor-grab touch-none items-center gap-2 border-b px-1.5 py-1 tracking-widest uppercase select-none"
        >
          <Icon icon="dots-six-vertical" class="text-xs" />
          <span>Signals</span>
          <span class="ml-auto flex items-center gap-1 normal-case">
            <span class="text-muted-foreground" data-show="!$hotreloading">
              live
            </span>
            <span class="text-warning" hidden data-attr:hidden="!$hotreloading">
              reconnecting
            </span>
          </span>
          <button
            type="button"
            id="dev-ui-close"
            class="text-muted-foreground hover:text-foreground cursor-pointer px-1"
            aria-label="Close dev tools"
          >
            <Icon icon="x" class="text-xs" />
          </button>
        </header>

        <pre
          class="min-h-0 flex-1 overflow-auto p-2 leading-tight"
          data-json-signals
        ></pre>

        {children !== undefined && (
          <div class="border-t px-2 py-1.5">{children}</div>
        )}

        <div class="text-2xs grid gap-0.5 border-t px-2 py-1.5">
          <Field label="build" value={generation.slice(0, 8)} />
          <Field label="start" value={startedAt} />
        </div>

        {/* Resize grip. */}
        <div
          id="dev-ui-resize"
          class="border-muted-foreground absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none border-r-2 border-b-2"
        ></div>
      </section>

      <script type="module" src="/static/dev-mode.js"></script>
    </div>
  );
}

export const devModeApp = new Hono();

// The generation is minted per server process and baked into the page. A client
// that reconnects with a stale generation was rendered by the previous process,
// so it is told to reload instead of being kept alive.
devModeApp.get("/hot-reload", (c) =>
  streamSSE(c, async (sender) => {
    if (c.req.query("generation") !== generation) {
      await sender.writeSSE({ data: "reload" });
      return;
    }

    while (!sender.aborted) {
      await sender.writeSSE({ data: "ping", retry: 200 });
      await Bun.sleep(1000);
    }
  }),
);

// NOTE(juraj): This was used for profiling. When the profiler was running
// and I killed the server with Ctrl+C, no profile information was lost.
// Therefore this was added to allow me to kill the server gracefully.
devModeApp.get("/exit", (c) => {
  logger().info("Exit endpoint called. Shutting down...");
  setTimeout(() => {
    logger().info("Exiting now.");
    // `process.exit` skips the logger's own shutdown hooks.
    void flushLogger().then(() => {
      process.exit(0);
    });
  }, 1000);

  return c.text("Shutting down...");
});
