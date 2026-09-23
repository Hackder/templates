// Client-side pan/zoom for the flame graph. The server renders every span
// with unitless `--s` (start offset ms) and `--d` (duration ms) variables;
// this script only maintains `--pan` (ms) and `--ppms` (pixels per ms) on the
// viewport, so bars reposition purely through CSS `calc()` — no scaling, text
// never distorts. Everything else on the page is server state over SSE.

/**
 * @typedef {{ pan: number; ppms: number; touched: boolean }} FlameView
 */

/** @type {Map<string, FlameView>} */
const flameViews = new Map();

function viewport() {
  return document.getElementById("flame-viewport");
}

/**
 * @param {HTMLElement} vp
 * @returns {FlameView}
 */
function fittedView(vp) {
  const total = Number(vp.dataset["total"] ?? "0");
  const width = vp.clientWidth > 40 ? vp.clientWidth : 800;
  const ppms = total > 0 ? (width - 16) / total : 0.05;
  return { pan: -8 / ppms, ppms, touched: false };
}

/**
 * @param {HTMLElement} vp
 * @returns {FlameView}
 */
function flameView(vp) {
  const traceId = vp.dataset["trace"] ?? "";
  let view = flameViews.get(traceId);
  if (view === undefined) {
    view = fittedView(vp);
    flameViews.set(traceId, view);
  }
  return view;
}

/**
 * @param {HTMLElement} vp
 */
function applyView(vp) {
  const view = flameView(vp);
  // Until the user pans or zooms, keep re-fitting so a running trace stays
  // fully in frame as it grows.
  if (!view.touched) {
    const fit = fittedView(vp);
    view.pan = fit.pan;
    view.ppms = fit.ppms;
  }
  vp.style.setProperty("--pan", String(view.pan));
  vp.style.setProperty("--ppms", String(view.ppms));
  drawAxis(vp, view);
}

/**
 * @param {number} ms
 */
function formatTick(ms) {
  if (Math.abs(ms) < 1000) {
    return `${Number(ms.toFixed(2))}ms`;
  }
  if (Math.abs(ms) < 60_000) {
    return `${Number((ms / 1000).toFixed(2))}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

/**
 * @param {HTMLElement} vp
 * @param {FlameView} view
 */
function drawAxis(vp, view) {
  const axis = document.getElementById("flame-axis");
  if (axis === null) {
    return;
  }
  const width = vp.clientWidth;
  const targetMs = 90 / view.ppms;
  if (!Number.isFinite(targetMs) || targetMs <= 0) {
    return;
  }
  const power = Math.pow(10, Math.floor(Math.log10(targetMs)));
  let step = power * 10;
  for (const multiple of [1, 2, 5]) {
    if (power * multiple >= targetMs) {
      step = power * multiple;
      break;
    }
  }

  let html = "";
  const first = Math.ceil(view.pan / step) * step;
  const last = view.pan + width / view.ppms;
  for (let t = first; t <= last; t += step) {
    const x = (t - view.pan) * view.ppms;
    if (x < 0) {
      continue;
    }
    html += `<div class="tick" style="left:${x}px">${formatTick(t)}</div>`;
  }
  axis.innerHTML = html;
}

// --- Interactions ------------------------------------------------------------

document.addEventListener(
  "wheel",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const vp = target.closest("#flame-viewport");
    if (!(vp instanceof HTMLElement)) {
      return;
    }

    // Trackpad pinch gestures arrive as Ctrl+wheel events in browsers. Leave
    // unmodified wheel events alone so the viewport scrolls vertically.
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const view = flameView(vp);
    view.touched = true;
    const rect = vp.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const cursorMs = view.pan + x / view.ppms;
    view.ppms *= Math.exp(-event.deltaY * 0.005);
    view.pan = cursorMs - x / view.ppms;
    applyView(vp);
  },
  { passive: false },
);

/**
 * @type {{
 *   vp: HTMLElement;
 *   x: number;
 *   y: number;
 *   scrollTop: number;
 *   panStart: number;
 *   moved: boolean;
 * } | null}
 */
let drag = null;
let suppressClick = false;

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (event.button !== 0 || !(target instanceof Element)) {
    return;
  }
  const vp = target.closest("#flame-viewport");
  if (!(vp instanceof HTMLElement)) {
    return;
  }
  drag = {
    vp,
    x: event.clientX,
    y: event.clientY,
    scrollTop: vp.scrollTop,
    panStart: flameView(vp).pan,
    moved: false,
  };
});

document.addEventListener("pointermove", (event) => {
  if (drag === null) {
    return;
  }
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) {
    drag.moved = true;
  }
  if (!drag.moved) {
    return;
  }
  const view = flameView(drag.vp);
  view.touched = true;
  view.pan = drag.panStart - dx / view.ppms;
  drag.vp.scrollTop = drag.scrollTop - dy;
  applyView(drag.vp);
});

document.addEventListener("pointerup", () => {
  if (drag === null) {
    return;
  }
  suppressClick = drag.moved;
  drag = null;
});

document.addEventListener(
  "click",
  (event) => {
    if (suppressClick) {
      // The pointer was dragging, not selecting a span.
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("#flame-fit") !== null) {
      const vp = viewport();
      if (vp !== null) {
        flameViews.set(vp.dataset["trace"] ?? "", fittedView(vp));
        applyView(vp);
      }
    }
  },
  true,
);

// --- Survive SSE morphs ------------------------------------------------------

// No observer of our own: `data-preserve-attr="style"` keeps `--pan`/`--ppms`
// across morphs, `data-ignore-morph` keeps the axis ticks, and the viewport's
// `data-effect` bakes the trace id and total duration into its attribute, so
// Datastar re-runs it exactly when a patch changes either — a trace switch
// picks up that trace's view, and an untouched running trace re-fits as it
// grows.

/**
 * @param {HTMLElement} vp
 * @param {string} _traceId
 * @param {number} _totalMs
 */
window.logviewFlame = (vp, _traceId, _totalMs) => {
  applyView(vp);
  // A morph resets every bar's class attribute; put the hover lineage back.
  applyLineage(vp);
};

// The first patch's effect may have run before this module loaded and hit the
// `?.` guard; sync whatever is on screen now.
const initialViewport = viewport();
if (initialViewport !== null) {
  applyView(initialViewport);
}

window.addEventListener("resize", () => {
  const vp = viewport();
  if (vp !== null) {
    applyView(vp);
  }
});

// --- Panel resizing ----------------------------------------------------------
// The .resizer bars between panels write panel sizes as CSS vars onto #app's
// inline style; `data-preserve-attr="style"` there keeps them across morphs.

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {string} kind
 * @returns {HTMLElement | null}
 */
function resizedPanel(kind) {
  let selector = null;
  if (kind === "traces") {
    selector = ".traces";
  } else if (kind === "inspector") {
    selector = ".inspector";
  } else if (kind === "flame") {
    selector = ".flame";
  }
  if (selector === null) {
    return null;
  }
  const panel = document.querySelector(selector);
  return panel instanceof HTMLElement ? panel : null;
}

/** @type {{ kind: string; x: number; y: number; size: number } | null} */
let panelDrag = null;

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (event.button !== 0 || !(target instanceof Element)) {
    return;
  }
  const resizer = target.closest(".resizer");
  if (!(resizer instanceof HTMLElement)) {
    return;
  }
  const kind = resizer.dataset["resize"] ?? "";
  const panel = resizedPanel(kind);
  if (panel === null) {
    return;
  }
  const rect = panel.getBoundingClientRect();
  panelDrag = {
    kind,
    x: event.clientX,
    y: event.clientY,
    size: kind === "flame" ? rect.height : rect.width,
  };
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  if (panelDrag === null) {
    return;
  }
  const app = document.getElementById("app");
  if (app === null) {
    return;
  }
  if (panelDrag.kind === "flame") {
    const size = clamp(
      panelDrag.size + event.clientY - panelDrag.y,
      60,
      window.innerHeight - 160,
    );
    app.style.setProperty("--h-flame", `${size}px`);
  } else {
    const grow =
      panelDrag.kind === "traces"
        ? event.clientX - panelDrag.x
        : panelDrag.x - event.clientX;
    const size = clamp(panelDrag.size + grow, 140, window.innerWidth - 400);
    app.style.setProperty(
      panelDrag.kind === "traces" ? "--w-traces" : "--w-inspector",
      `${size}px`,
    );
  }
  // The flame viewport's size follows the panels; keep fit and axis in step.
  const vp = viewport();
  if (vp !== null) {
    applyView(vp);
  }
});

document.addEventListener("pointerup", () => {
  panelDrag = null;
});

// --- Event hover time marker -------------------------------------------------
// Event rows carry `data-marker` (ms offset from trace start); hovering one
// shows #flame-marker at that time in the flame graph. Positioning is pure
// CSS from the `--s` var, so it pans and zooms with the bars.

document.addEventListener("pointerover", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const row = target.closest("[data-marker]");
  if (!(row instanceof HTMLElement)) {
    return;
  }
  const offset = row.dataset["marker"];
  const marker = document.getElementById("flame-marker");
  if (offset === undefined || marker === null) {
    return;
  }
  marker.style.setProperty("--s", offset);
  marker.hidden = false;
});

document.addEventListener("pointerout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const row = target.closest("[data-marker]");
  if (row === null) {
    return;
  }
  // Still inside the same row (moving between its children) — keep it.
  const next = event.relatedTarget;
  if (next instanceof Element && next.closest("[data-marker]") === row) {
    return;
  }
  const marker = document.getElementById("flame-marker");
  if (marker !== null) {
    marker.hidden = true;
  }
});

// --- Span lineage highlight --------------------------------------------------
// Hovering a bar lights up its ancestors and descendants and dims everything
// else, so concurrent branches can be told apart at a glance. Bars carry
// `data-span` / `data-parent`; the tree is walked from those on every hover,
// so no client-side model of the trace is needed.

/**
 * The id of the span currently hovered, kept across SSE morphs.
 * @type {string | null}
 */
let hoveredSpanId = null;

/**
 * @param {HTMLElement} vp
 */
function applyLineage(vp) {
  /** @type {Map<string, HTMLElement>} */
  const bars = new Map();
  /** @type {Map<string, string>} */
  const parentOf = new Map();
  for (const bar of vp.querySelectorAll(".flame-span[data-span]")) {
    if (!(bar instanceof HTMLElement)) {
      continue;
    }
    const id = bar.dataset["span"] ?? "";
    bars.set(id, bar);
    const parent = bar.dataset["parent"];
    if (parent !== undefined) {
      parentOf.set(id, parent);
    }
  }

  const hovered = hoveredSpanId === null ? undefined : bars.get(hoveredSpanId);
  if (hovered === undefined) {
    // Fell off the graph (or nothing hovered): clear any leftover marks.
    vp.classList.remove("has-hover");
    for (const bar of bars.values()) {
      bar.classList.remove("sp-hover", "sp-ancestor", "sp-descendant");
    }
    return;
  }

  /** @type {Set<string>} */
  const ancestors = new Set();
  for (
    let id = parentOf.get(hoveredSpanId ?? "");
    id !== undefined && !ancestors.has(id);
    id = parentOf.get(id)
  ) {
    ancestors.add(id);
  }

  // A bar descends from the hovered one if walking up its parents reaches it.
  // The walk is memoised per bar so the whole graph is one linear pass.
  /** @type {Map<string, boolean>} */
  const descends = new Map();
  /**
   * @param {string} id
   * @returns {boolean}
   */
  function isDescendant(id) {
    const known = descends.get(id);
    if (known !== undefined) {
      return known;
    }
    const parent = parentOf.get(id);
    let result = false;
    if (parent === hoveredSpanId) {
      result = true;
    } else if (parent !== undefined) {
      descends.set(id, false); // cycle guard
      result = isDescendant(parent);
    }
    descends.set(id, result);
    return result;
  }

  vp.classList.add("has-hover");
  for (const [id, bar] of bars) {
    bar.classList.toggle("sp-hover", id === hoveredSpanId);
    bar.classList.toggle("sp-ancestor", ancestors.has(id));
    bar.classList.toggle("sp-descendant", isDescendant(id));
  }
}

document.addEventListener("pointerover", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const bar = target.closest(".flame-span[data-span]");
  if (!(bar instanceof HTMLElement)) {
    return;
  }
  const vp = bar.closest("#flame-viewport");
  if (!(vp instanceof HTMLElement)) {
    return;
  }
  const id = bar.dataset["span"] ?? "";
  if (id === hoveredSpanId) {
    return;
  }
  hoveredSpanId = id;
  applyLineage(vp);
});

document.addEventListener("pointerout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const bar = target.closest(".flame-span[data-span]");
  if (bar === null) {
    return;
  }
  const next = event.relatedTarget;
  if (
    next instanceof Element &&
    next.closest(".flame-span[data-span]") === bar
  ) {
    return;
  }
  const vp = bar.closest("#flame-viewport");
  hoveredSpanId = null;
  if (vp instanceof HTMLElement) {
    applyLineage(vp);
  }
});
