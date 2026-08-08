import { attribute, root } from "./datastar-1.0.2.js";

let reloadingSetup = false;

async function setupHotReload(endpoint) {
  if (reloadingSetup) {
    return;
  }
  reloadingSetup = true;

  while (true) {
    const source = new EventSource(endpoint);
    source.onmessage = (event) => {
      if (event.data === "reload") {
        window.location.reload();
      }
    };
    source.onopen = () => {
      root.hotreloading = false;
    };

    await new Promise((resolve) => {
      source.onerror = resolve;
    });
    source.close();
    root.hotreloading = true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

attribute({
  name: "hotreload",
  requirement: { key: "denied", value: "must" },
  apply({ value }) {
    setupHotReload(value);
  },
});

attribute({
  name: "push-url",
  requirement: { key: "denied", value: "must" },
  apply({ value, mods, el }) {
    if (mods.has("ifdifferent") && window.location.href === value) {
      return;
    }
    history.pushState({ url: value }, "", value);
    el.removeAttribute("data-push-url");
  },
});

function softwareKeyboardOpen() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return false;
  }
  return window.innerHeight - viewport.height * viewport.scale > 150;
}

const nativeStartViewTransition = document.startViewTransition?.bind(document);
if (nativeStartViewTransition) {
  document.startViewTransition = (updateOrOptions) => {
    if (!softwareKeyboardOpen()) {
      return nativeStartViewTransition(updateOrOptions);
    }
    const update =
      typeof updateOrOptions === "function"
        ? updateOrOptions
        : updateOrOptions?.update;
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

window.addEventListener("pageswap", (event) => {
  if (event.viewTransition && softwareKeyboardOpen()) {
    event.viewTransition.skipTransition();
  }
});
