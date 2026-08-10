import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Temporal } from "temporal-polyfill";
import { Icon } from "./web/components/icon";

// Namespaces the dev overlay's localStorage entries (tab position, panel
// geometry). Change it per project so two apps sharing a localhost port do not
// fight over each other's layout.
const DEV_UI_PERSIST_KEY = "bun-hono-datastar";

const generation = crypto.randomUUID();
const startedAt = Temporal.Now.instant().toString();

// The overlay is deliberately self-contained: neutral colours, sharp corners,
// no animation. It has to sit on top of any page this template grows into
// without inheriting or clashing with that page's design.
interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div class="flex items-baseline gap-2 overflow-hidden">
      <span class="w-12 shrink-0 text-neutral-500">{label}</span>
      <span class="truncate text-neutral-300">{value}</span>
    </div>
  );
}

export function DevMode() {
  return (
    <div
      id="dev-ui"
      data-dev-ui-key={DEV_UI_PERSIST_KEY}
      data-hotreload={`/hot-reload?generation=${generation}`}
      class="pointer-events-none fixed inset-0 z-[2147483647] font-mono text-[12px] text-neutral-300"
    >
      {/* Collapsed state: a single icon that reports connection health. Drag it
          to any edge; a click opens the panel. */}
      <button
        type="button"
        id="dev-ui-tab"
        class="pointer-events-auto absolute flex size-7 cursor-grab touch-none items-center justify-center border border-neutral-700 bg-neutral-950 text-neutral-400 hover:text-neutral-100"
        aria-label="Toggle dev tools"
      >
        <Icon icon="lightning" class="text-[14px]" data-show="!$hotreloading" />
        <Icon
          icon="plugs"
          class="text-[14px] text-amber-400"
          style="display: none;"
          data-show="$hotreloading"
        />
      </button>

      <section
        id="dev-ui-panel"
        class="pointer-events-auto absolute flex flex-col border border-neutral-700 bg-neutral-950"
        style="display: none;"
      >
        <header
          id="dev-ui-drag"
          class="flex cursor-grab touch-none items-center gap-2 border-b border-neutral-800 px-1.5 py-1 text-[11px] tracking-widest text-neutral-500 uppercase select-none"
        >
          <Icon icon="dots-six-vertical" class="text-[13px]" />
          <span>Signals</span>
          <span class="ml-auto flex items-center gap-1 normal-case">
            <span class="text-neutral-400" data-show="!$hotreloading">
              live
            </span>
            <span
              class="text-amber-400"
              style="display: none;"
              data-show="$hotreloading"
            >
              reconnecting
            </span>
          </span>
          <button
            type="button"
            id="dev-ui-close"
            class="cursor-pointer px-1 text-neutral-500 hover:text-neutral-100"
            aria-label="Close dev tools"
          >
            <Icon icon="x" class="text-[13px]" />
          </button>
        </header>

        <pre
          class="min-h-0 flex-1 overflow-auto p-2 leading-tight"
          data-json-signals
        ></pre>

        <div class="grid gap-0.5 border-t border-neutral-800 px-2 py-1.5 text-[11px]">
          <Field label="build" value={generation.slice(0, 8)} />
          <Field label="start" value={startedAt} />
        </div>

        {/* Resize grip. */}
        <div
          id="dev-ui-resize"
          class="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none border-r-2 border-b-2 border-neutral-600"
        ></div>
      </section>

      <script type="module" src="/static/dev-mode.js"></script>
    </div>
  );
}

export const devModeApp = new Hono();

devModeApp.get("/hot-reload", (context) =>
  streamSSE(context, async (sender) => {
    if (context.req.query("generation") !== generation) {
      await sender.writeSSE({ data: "reload" });
      return;
    }

    while (!sender.aborted) {
      await sender.writeSSE({ data: "ping" });
      await Bun.sleep(1000);
    }
  }),
);
