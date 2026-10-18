// The tab's one live connection: the /updates stream every page opens from
// #app.

/** `data-init` of #app: opens the tab's stream. */
export const OPEN_UPDATES = "@get('/updates')";

/**
 * What the stream adds to a tab whose view session the server does not
 * know (it restarted since the page loaded): it reloads the page, and the
 * page load starts a known session from the URL. It is added beside the
 * page rather than morphed over it, so the page keeps showing what it had
 * until the reload replaces it.
 */
export function ReloadTab() {
  return <div hidden data-init="window.location.reload()"></div>;
}
