import { Spinner } from "./components/busy";
import { Icon } from "./components/icon";

// The tab's one live connection: the /updates stream every page opens from
// #app. While it is down nothing on the page changes, so the page says so
// (a delayed slip, so a blip never flashes it). `static/script.js` follows
// the stream's Datastar events and records its state on the root element,
// which no morph touches; the slip below shows from that attribute alone.

/**
 * `data-init` of #app: opens the stream, and reopens it whenever it ends.
 * Datastar's default ("auto") retries only a network error, ten times:
 * Safari reports a server that went away as a stream that ended cleanly,
 * and a proxy answers an error status while the app restarts for a deploy,
 * so a tab left open would stop updating after either. The stream is never
 * meant to end while the page is open (a tab the server forgot reloads),
 * so any end is retried, forever, the backoff capped at Datastar's 30 s.
 */
export const OPEN_UPDATES =
  "@get('/updates', { retry: 'always', retryMaxCount: Infinity })";

/**
 * The slip at the foot of the page while the stream is down: reconnecting
 * (Datastar is retrying) or lost (the stream ended for good, so only a
 * reload brings the page back). Always rendered and hidden by the
 * `connection-slip` utility, which also holds it back for a moment, so a
 * blip never flashes it. Every page renders it inside #app.
 */
export function ConnectionSlip() {
  return (
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
      <div
        id="connection"
        role="status"
        class="connection-slip bg-popover text-popover-foreground pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-lg border py-2.5 pr-2.5 pl-3.5 text-sm shadow-lg"
      >
        <span class="reconnecting:contents hidden">
          <Spinner class="text-warning text-base" />
          <span class="min-w-0 flex-1">
            <span class="font-semibold">Reconnecting…</span>{" "}
            <span class="text-muted-foreground">
              Until then this page may be out of date.
            </span>
          </span>
        </span>
        <span class="disconnected:contents hidden">
          <Icon
            icon="wifi-slash"
            class="text-destructive text-base"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="font-semibold">Disconnected.</span>{" "}
            <span class="text-muted-foreground">
              This page stopped updating.
            </span>
          </span>
          <button
            type="button"
            class="text-primary hover:bg-accent inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors"
            data-on:click="window.location.reload()"
          >
            <Icon icon="arrow-clockwise" class="text-sm" />
            Reload
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * What the stream adds to a tab whose view session the server does not
 * know (it restarted since the page loaded): it reloads the page, and the
 * page load starts a known session from the URL. It is added beside the
 * page rather than morphed over it, so the page keeps showing what it had
 * until the reload replaces it.
 */
export function ReloadTab() {
  return <div hidden data-init="window.location.reload()"></div>;
}
