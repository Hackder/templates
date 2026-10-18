import { subscribeDevices } from "../auth/devices";
import type { DatastarEventSender } from "../datastar";
import { subscribe } from "../state";
import { BUSY_DONE_EVENT, openBusy } from "./busy";
import { type ViewState, holdView, subscribeView } from "./session";

/** What the stream needs of the event sender. */
export type UpdatesSender = Pick<
  DatastarEventSender,
  "aborted" | "onAbort" | "patchElements" | "appendElements" | "watcherEvent"
>;

/** What the stream shows: the tab's page, while its device is signed in. */
export interface UpdatesPage {
  render: (view: ViewState) => string | Promise<string>;
  /** Always true while the password gate is off. */
  signedIn: () => boolean;
  /**
   * For a tab whose view session the server does not know: an element
   * that reloads the page once it is added to it.
   */
  reload: () => string | Promise<string>;
}

/**
 * The one long-lived stream each tab holds. Any change to the app state, to
 * the device list or to this session's view marks it dirty; the loop then
 * renders the whole page once, however many changes arrived meanwhile, and
 * Datastar morphs it in (which keeps scroll position and focus). After
 * each render it says which of the tab's busy requests are done, those
 * queued before the render started, so a control stops spinning once its
 * action's result is on the page (./busy); a stream starts by saying it
 * of every request the tab's ledger holds, in case an earlier stream lost
 * the word.
 *
 * A session the server does not know (it restarted since the page loaded,
 * or forgot the idle tab) has nothing to render from: the stream adds the
 * reload element to the page, which keeps showing what it had until the
 * reload replaces it, and ends, as it does for a signed-out page. The page
 * load starts a known session. While the stream is open its session is held
 * (`holdView`), so the server cannot forget it meanwhile.
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
  function wakeUp(): void {
    wake?.();
  }
  function markDirty(): void {
    dirty = true;
    wakeUp();
  }

  const busy = openBusy(view, wakeUp);
  const unsubscribeState = subscribe(markDirty);
  const unsubscribeView = subscribeView(sessionId, markDirty);
  // Signing out or revoking this device wakes the loop, which renders
  // the signed-out page (it sends the tab to /login) and ends the stream.
  const unsubscribeDevices = subscribeDevices(markDirty);
  sender.onAbort(wakeUp);

  try {
    while (!sender.aborted) {
      if (!dirty && !busy.pending()) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
        // Batching, not ordering: changes that land within this turn of
        // the event loop share one render.
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        continue;
      }
      // Taken before rendering (see `BusyStream.take`): a word queued
      // during the render waits for the next one.
      const done = busy.take();
      if (dirty) {
        dirty = false;
        await sender.patchElements(page.render(view));
        if (!page.signedIn()) {
          break;
        }
      }
      if (done !== null) {
        await sender.watcherEvent(BUSY_DONE_EVENT, { ids: done.join(" ") });
      }
    }
  } finally {
    busy.close();
    unsubscribeState();
    unsubscribeView();
    unsubscribeDevices();
    held.release();
  }
}
