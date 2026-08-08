import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Icon } from "./web/components/icon";

const generation = crypto.randomUUID();

export function DevMode() {
  return (
    <>
      <div
        data-signals__ifmissing={JSON.stringify({ _devtoolsOpen: false })}
        data-on:click="$_devtoolsOpen = !$_devtoolsOpen"
        data-hotreload={`/hot-reload?generation=${generation}`}
        class="pointer-events-none fixed bottom-4 left-4 z-50"
      >
        <button class="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full border border-cyan-400/20 bg-slate-900/90 px-4 py-2 text-xs font-medium text-cyan-300 shadow-lg backdrop-blur-sm">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-cyan-400"></span>
          </span>
          DEV MODE
          <Icon
            icon="spinner"
            class="animate-spin"
            style="display: none;"
            data-show="$hotreloading"
          />
        </button>
      </div>
      <div
        id="devtools"
        class="fixed right-4 bottom-4 z-50 h-96 w-96 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
        style="display: none;"
        data-show="$_devtoolsOpen"
      >
        <div class="mb-2 border-b border-slate-800 pb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
          Signal State
        </div>
        <pre class="font-mono text-xs text-slate-300" data-json-signals></pre>
      </div>
    </>
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
