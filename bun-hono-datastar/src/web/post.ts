/** A Datastar `@post` expression; the URL is a JSON string literal. */
export function post(path: string, query: [string, string][] = []): string {
  const search = new URLSearchParams(query).toString();
  return `@post(${JSON.stringify(search === "" ? path : `${path}?${search}`)})`;
}

/**
 * The name of one control's `data-indicator` signal, true while its post is
 * in flight, e.g. `indicator("delete", item.id)`. Local (leading
 * underscore), and unique per control: Datastar's signals are page-wide, so
 * two rows must not share one. A hash keeps it a plain identifier whatever
 * the ids contain. The post answers once its change is on the tab's stream
 * (./emission), so the indicator lasts until the change is shown.
 */
export function indicator(...parts: string[]): `_${string}` {
  return `_busy${Bun.hash(parts.join("\u0000")).toString(36)}`;
}
