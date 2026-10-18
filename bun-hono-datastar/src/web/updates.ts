import type { DatastarEventSender } from "../datastar";
import { subscribe } from "../state";
import { currentVersion } from "../version";
import { openEmission } from "./emission";
import { type ViewState, holdView, subscribeView } from "./session";

/** What the stream needs of the event sender. */
export type UpdatesSender = Pick<
  DatastarEventSender,
  "aborted" | "onAbort" | "patchElements" | "appendElements"
>;

/** What the stream shows: the tab's page. */
export interface UpdatesPage {
  render: (view: ViewState) => string | Promise<string>;
  /**
   * For a tab whose view session the server does not know: an element
   * that reloads the page once it is added to it.
   */
  reload: () => string | Promise<string>;
}

/**
 * The one long-lived stream each tab holds. Any change to the app state or
 * to this session's view marks it dirty; the loop then renders the whole
 * page once, however many changes arrived meanwhile, and Datastar morphs it
 * in (which keeps scroll position and focus). Each render is recorded as
 * emitted at the version it started from, once its events are written
 * (./emission), which is what answers the tab's actions.
 *
 * A session the server does not know (it restarted since the page loaded,
 * or forgot the idle tab) has nothing to render from: the stream adds the
 * reload element to the page, which keeps showing what it had until the
 * reload replaces it, and ends. The page load starts a known session. While
 * the stream is open its session is held (`holdView`), so the server cannot
 * forget it meanwhile.
 */
export async function streamUpdates(
  sessionId: string,
  sender: UpdatesSender,
  page: UpdatesPage,
): Promise<void> {
  const held = holdView(sessionId);
  if (held === undefined) {
    await sender.appendElements(page.reload());
    return;
  }
  const { view } = held.session;
  let dirty = true;
  let wake: (() => void) | undefined;
  function markDirty(): void {
    dirty = true;
    wake?.();
  }

  const emission = openEmission(sessionId);
  const unsubscribeState = subscribe(markDirty);
  const unsubscribeView = subscribeView(sessionId, markDirty);
  sender.onAbort(() => {
    wake?.();
  });

  try {
    while (!sender.aborted) {
      if (dirty) {
        dirty = false;
        // Read before rendering: a change during the render marks the
        // stream dirty again and is emitted by the next one.
        const version = currentVersion();
        await sender.patchElements(page.render(view));
        emission.emitted(version);
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
      // Batching, not ordering: changes that land within this turn of the
      // event loop share one render.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  } finally {
    emission.close();
    unsubscribeState();
    unsubscribeView();
    held.release();
  }
}
