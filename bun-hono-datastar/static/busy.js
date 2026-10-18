// What the stream's "these busy requests are done" ends (static/script.js),
// apart from the page so it can be tested without a browser.

/**
 * The names of the busy controls (the `busy` signals) that hold one of the
 * `done` request ids. One holding another id is a newer click, still busy.
 * @param {unknown} busy the `busy` signals: control name → request id
 * @param {string[]} done
 * @returns {string[]}
 */
export function finishedBusy(busy, done) {
  if (busy === null || typeof busy !== "object") {
    return [];
  }
  const ids = new Set(done);
  return Object.entries(busy)
    .filter(([, id]) => typeof id === "string" && ids.has(id))
    .map(([name]) => name);
}
