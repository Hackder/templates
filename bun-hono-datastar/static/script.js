import { attribute, action, root } from "./datastar-1.0.4.js";

attribute({
  name: "hotreload",
  requirement: {
    key: "denied",
    value: "must",
  },
  apply({ value }) {
    /** @type {EventSource | undefined} */
    let source;
    let disposed = false;

    function disconnect() {
      source?.close();
      source = undefined;
    }

    function connect() {
      if (disposed || document.hidden || source !== undefined) {
        return;
      }

      const connection = new EventSource(value);
      source = connection;
      connection.onopen = () => {
        console.log("Hot reload connection established.");
        root["hotreloading"] = false;
      };
      connection.onmessage = (event) => {
        if (event.data === "reload") {
          window.location.reload();
        }
      };
      connection.onerror = () => {
        if (source === connection) {
          root["hotreloading"] = true;
        }
      };
    }

    function onVisibilityChange() {
      if (document.hidden) {
        disconnect();
      } else {
        connect();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    // Explicitly close before navigation and reconnect after BFCache restores;
    // some browsers leave EventSource connections from old documents alive.
    window.addEventListener("pagehide", disconnect);
    window.addEventListener("pageshow", connect);
    // Datastar applies a replacement attribute before cleaning up the old one.
    queueMicrotask(connect);

    return () => {
      disposed = true;
      disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("pageshow", connect);
    };
  },
});

attribute({
  name: "push-url",
  requirement: {
    key: "denied",
    value: "must",
  },
  apply({ value, mods, el }) {
    if (mods.has("ifdifferent")) {
      if (window.location.href === value) {
        return;
      }
    }
    history.pushState({ url: value }, "", value);
    el.removeAttribute("data-push-url");
  },
});

action({
  name: "navigateHash",
  apply(_ctx, href) {
    const url = new URL(href, window.location.href);
    const hash = url.hash.slice(1);

    const state =
      history.state && typeof history.state === "object"
        ? { ...history.state, url: url.toString() }
        : history.state;
    history.replaceState(state, "", url.toString());

    document.getElementById(hash)?.scrollIntoView();
  },
});

// Mobile Safari positions view-transition snapshots against the layout
// viewport instead of the snapshot containing block (WebKit bug 285400).
// With the software keyboard open the visual viewport is offset within the
// layout viewport, so for the duration of a transition the page renders
// shifted — it appears to scroll up and jump back when the animation ends.
// The keyboard is the only thing that shrinks the visual viewport without
// shrinking the layout viewport (pinch zoom shrinks it too, but scales it
// back up), which is what this detects.
function softwareKeyboardOpen() {
  const viewport = window.visualViewport;
  if (!viewport) return false;
  return window.innerHeight - viewport.height * viewport.scale > 150;
}

// Same-document transitions (datastar patches with useViewTransition): apply
// the DOM update without animating while the keyboard is up. Datastar calls
// document.startViewTransition dynamically, so wrapping it here covers every
// patch. The stub mirrors the ViewTransition shape for any caller that reads
// the return value; datastar ignores it.
const nativeStartViewTransition = document.startViewTransition?.bind(document);
if (nativeStartViewTransition) {
  document.startViewTransition = (updateOrOptions) => {
    if (!softwareKeyboardOpen()) {
      return nativeStartViewTransition(updateOrOptions);
    }
    /** @type {ViewTransitionUpdateCallback | null | undefined} */
    let update;
    if (typeof updateOrOptions === "function") {
      update = updateOrOptions;
    } else {
      update = updateOrOptions?.update;
    }
    const updateDone = Promise.resolve(update?.());
    return {
      updateCallbackDone: updateDone,
      ready: updateDone,
      finished: updateDone,
      types: new Set(),
      skipTransition() {},
    };
  };
}

// Cross-document transitions (should a stylesheet opt in with
// @view-transition) never go through startViewTransition: skip those at
// snapshot time instead.
window.addEventListener("pageswap", (event) => {
  if (event.viewTransition && softwareKeyboardOpen()) {
    event.viewTransition.skipTransition();
  }
});

// A stale tab: the server no longer knows this page's view session (it
// restarted since the page loaded), so it answers an action with 410 and
// changes nothing. Reload, which starts a known session. The /updates
// stream does the same for a stale tab by adding an element that reloads
// (ReloadTab in src/web/connection.tsx).
document.addEventListener("datastar-fetch", (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }
  const detail = event.detail;
  if (detail?.type === "error" && detail.argsRaw?.status === "410") {
    window.location.reload();
  }
});

// Signed out (the device session expired or was revoked while this page was
// open): the server answers Datastar's requests with 401, which Datastar
// reports as a fetch error. Go to the login form, which brings the user back
// here afterwards.
document.addEventListener("datastar-fetch", (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }
  const detail = event.detail;
  if (detail?.type === "error" && detail.argsRaw?.status === "401") {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }
});

// The live connection: the tab's /updates stream, opened by #app's data-init
// (OPEN_UPDATES in src/web/connection.tsx). Datastar reports it through the
// same events: "retrying" when an attempt failed and another is scheduled,
// each of the stream's own events as it arrives, and "finished" once it has
// stopped for good. Its state goes on the root element, which the stream's
// morphs never touch, and the connection slip shows from there (CSS only,
// including the delay that keeps a blip from flashing it). Each (re)opened
// stream starts with a render, so its first event means "live again".
document.addEventListener("datastar-fetch", (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }
  /** @type {{ type?: unknown; el?: unknown } | null | undefined} */
  const detail = event.detail;
  if (!(detail?.el instanceof Element) || detail.el.id !== "app") {
    return;
  }
  const root = document.documentElement;
  if (detail.type === "retrying") {
    root.dataset["connection"] = "reconnecting";
  } else if (detail.type === "finished") {
    root.dataset["connection"] = "lost";
  } else if (
    typeof detail.type === "string" &&
    detail.type.startsWith("datastar-")
  ) {
    delete root.dataset["connection"];
  }
});
