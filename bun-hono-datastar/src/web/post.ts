import assert from "node:assert/strict";
import { BUSY_NAME } from "./busy";

/** A request's URL with its query string. */
function urlOf(path: string, query: [string, string][]): string {
  const search = new URLSearchParams(query).toString();
  return search === "" ? path : `${path}?${search}`;
}

/** A Datastar `@post` expression; the URL is a JSON string literal. */
export function post(path: string, query: [string, string][] = []): string {
  return `@post(${JSON.stringify(urlOf(path, query))})`;
}

/**
 * One control's busy state and the actions that run under it (`@busyPost`
 * in static/script.js, src/web/busy.ts): the control is busy from its click
 * until the tab's stream shows the action's result, and ignores clicks
 * meanwhile.
 */
export interface Busy {
  /** For the control's `data-attr:aria-busy`: 'true' while busy. */
  aria: string;
  /** Its action, like `post`. */
  post: (path: string, query?: [string, string][]) => string;
}

/**
 * The busy state of one control, e.g. `busy("delete", item.id)`. Unique per
 * control: Datastar's signals are page-wide, so two rows must not share
 * one. The first part names it, a hash of the rest keeps the name a plain
 * identifier whatever the ids contain.
 */
export function busy(kind: string, ...ids: string[]): Busy {
  const name =
    ids.length === 0
      ? kind
      : `${kind}_${Bun.hash(ids.join("\u0000")).toString(36)}`;
  const signal = name.replaceAll("-", "_");
  assert(
    BUSY_NAME.test(signal),
    "busy kinds are short words written in the code, and the hash is base 36",
  );
  const quoted = JSON.stringify(signal);
  return {
    aria: `${quoted} in $busy && 'true'`,
    post: (path, query = []) =>
      `@busyPost(${quoted}, ${JSON.stringify(urlOf(path, query))})`,
  };
}
