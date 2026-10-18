// One counter for every change a page renders from: the app state
// (src/state.ts) and a tab's view state (src/web/session.ts). Each such
// change advances it right before its listeners hear about it, so a version
// names "the state as of that change", and a render started when the
// counter reads `v` shows every change up to `v`. The /updates streams
// record which version they have written (src/web/emission.ts), and an
// action answers once its own change's version has been written to its tab.

/** A point in the history of the renderable state; larger is later. */
export type Version = number;

let current: Version = 0;

/**
 * For the owner of a renderable change, called synchronously with it,
 * before notifying: the version that change produced.
 */
export function advanceVersion(): Version {
  current += 1;
  return current;
}

/** The version of the state as it is now. */
export function currentVersion(): Version {
  return current;
}
