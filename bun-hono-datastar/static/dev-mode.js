// Layout behaviour for the dev overlay: a draggable edge tab that toggles a
// draggable, resizable panel. Everything the developer arranges is persisted
// under the project's persist key so two apps on the same origin keep their own
// layout. Dev-only — it is never served in production.

/**
 * The overlay markup always ships with this script (both come from the DevMode
 * component), so a missing element is a bug worth failing loudly on.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
function requireElement(id) {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`dev-ui: missing #${id}`);
  }
  return element;
}

const root = requireElement("dev-ui");
const tab = requireElement("dev-ui-tab");
const panel = requireElement("dev-ui-panel");
const dragHandle = requireElement("dev-ui-drag");
const resizeHandle = requireElement("dev-ui-resize");
const closeButton = requireElement("dev-ui-close");

const namespace = `dev-ui:${root.dataset.devUiKey ?? "default"}`;
const DRAG_THRESHOLD = 4;
const MIN_PANEL = { width: 260, height: 160 };

/**
 * @template {object} T
 * @param {string} name
 * @param {T} fallback
 * @returns {T}
 */
function read(name, fallback) {
  try {
    const raw = localStorage.getItem(`${namespace}:${name}`);
    return raw === null ? fallback : { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

/**
 * @param {string} name
 * @param {object} value
 */
function write(name, value) {
  try {
    localStorage.setItem(`${namespace}:${name}`, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: layout memory is not worth failing over.
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** @typedef {"left" | "right" | "top" | "bottom"} Side */
/** @typedef {{ side: Side, ratio: number }} TabPosition */
/** @typedef {{ x: number, y: number, width: number, height: number }} PanelBox */

// The tab is stored as an edge plus a ratio along that edge, so it stays put
// (relative to the edge it was parked on) when the viewport is resized.
let tabPosition = read(
  "tab",
  /** @type {TabPosition} */ ({
    side: "left",
    ratio: 0.94,
  }),
);
let panelBox = read(
  "panel",
  /** @type {PanelBox} */ ({
    x: 48,
    y: 48,
    width: 380,
    height: 260,
  }),
);
let panelOpen = read("open", { value: false }).value;

function placeTab() {
  const width = tab.offsetWidth;
  const height = tab.offsetHeight;
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  const alongX = clamp(
    tabPosition.ratio * window.innerWidth - width / 2,
    0,
    maxX,
  );
  const alongY = clamp(
    tabPosition.ratio * window.innerHeight - height / 2,
    0,
    maxY,
  );

  if (tabPosition.side === "left") {
    moveTab(0, alongY);
  } else if (tabPosition.side === "right") {
    moveTab(maxX, alongY);
  } else if (tabPosition.side === "top") {
    moveTab(alongX, 0);
  } else {
    moveTab(alongX, maxY);
  }
}

/**
 * @param {number} x
 * @param {number} y
 */
function moveTab(x, y) {
  tab.style.left = `${x}px`;
  tab.style.top = `${y}px`;
}

function placePanel() {
  const width = clamp(
    panelBox.width,
    MIN_PANEL.width,
    Math.max(MIN_PANEL.width, window.innerWidth),
  );
  const height = clamp(
    panelBox.height,
    MIN_PANEL.height,
    Math.max(MIN_PANEL.height, window.innerHeight),
  );
  panelBox = {
    width,
    height,
    x: clamp(panelBox.x, 0, Math.max(0, window.innerWidth - width)),
    y: clamp(panelBox.y, 0, Math.max(0, window.innerHeight - height)),
  };
  panel.style.left = `${panelBox.x}px`;
  panel.style.top = `${panelBox.y}px`;
  panel.style.width = `${panelBox.width}px`;
  panel.style.height = `${panelBox.height}px`;
}

/**
 * @param {boolean} open
 */
function setPanelOpen(open) {
  panelOpen = open;
  panel.style.display = open ? "flex" : "none";
  if (open) {
    placePanel();
  }
  write("open", { value: open });
}

/**
 * @typedef {object} DragHandlers
 * @property {() => void} [onStart]
 * @property {(deltaX: number, deltaY: number) => void} onMove
 * @property {(deltaX: number, deltaY: number) => void} [onEnd]
 */

/**
 * One drag primitive for all three gestures. `onMove` receives the pointer
 * delta from where the gesture started.
 *
 * @param {HTMLElement} element
 * @param {DragHandlers} handlers
 */
function onDrag(element, { onStart, onMove, onEnd }) {
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    element.setPointerCapture(event.pointerId);
    onStart?.();

    /** @param {PointerEvent} moveEvent */
    const move = (moveEvent) => {
      onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
    };
    /** @param {PointerEvent} endEvent */
    const end = (endEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      onEnd?.(endEvent.clientX - startX, endEvent.clientY - startY);
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  });
}

let tabOrigin = { x: 0, y: 0 };
onDrag(tab, {
  onStart: () => {
    tabOrigin = { x: tab.offsetLeft, y: tab.offsetTop };
  },
  onMove: (deltaX, deltaY) => {
    moveTab(
      clamp(tabOrigin.x + deltaX, 0, window.innerWidth - tab.offsetWidth),
      clamp(tabOrigin.y + deltaY, 0, window.innerHeight - tab.offsetHeight),
    );
  },
  onEnd: (deltaX, deltaY) => {
    if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
      placeTab();
      setPanelOpen(!panelOpen);
      return;
    }
    snapTab();
  },
});

// Dropped tabs snap to whichever viewport edge their centre is closest to.
function snapTab() {
  const centerX = tab.offsetLeft + tab.offsetWidth / 2;
  const centerY = tab.offsetTop + tab.offsetHeight / 2;
  /** @type {{ side: Side, distance: number, ratio: number }[]} */
  const distances = [
    { side: "left", distance: centerX, ratio: centerY / window.innerHeight },
    {
      side: "right",
      distance: window.innerWidth - centerX,
      ratio: centerY / window.innerHeight,
    },
    { side: "top", distance: centerY, ratio: centerX / window.innerWidth },
    {
      side: "bottom",
      distance: window.innerHeight - centerY,
      ratio: centerX / window.innerWidth,
    },
  ];
  const closest = distances.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );
  tabPosition = { side: closest.side, ratio: closest.ratio };
  write("tab", tabPosition);
  placeTab();
}

let panelOrigin = { x: 0, y: 0 };
onDrag(dragHandle, {
  onStart: () => {
    panelOrigin = { x: panelBox.x, y: panelBox.y };
  },
  onMove: (deltaX, deltaY) => {
    panelBox = {
      ...panelBox,
      x: panelOrigin.x + deltaX,
      y: panelOrigin.y + deltaY,
    };
    placePanel();
  },
  onEnd: () => write("panel", panelBox),
});

let sizeOrigin = { width: 0, height: 0 };
onDrag(resizeHandle, {
  onStart: () => {
    sizeOrigin = { width: panelBox.width, height: panelBox.height };
  },
  onMove: (deltaX, deltaY) => {
    panelBox = {
      ...panelBox,
      width: sizeOrigin.width + deltaX,
      height: sizeOrigin.height + deltaY,
    };
    placePanel();
  },
  onEnd: () => write("panel", panelBox),
});

closeButton.addEventListener("pointerdown", (event) => event.stopPropagation());
closeButton.addEventListener("click", () => setPanelOpen(false));

window.addEventListener("resize", () => {
  placeTab();
  if (panelOpen) {
    placePanel();
  }
});

placeTab();
setPanelOpen(panelOpen);
