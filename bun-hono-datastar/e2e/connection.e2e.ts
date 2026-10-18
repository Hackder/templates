import { expect, test } from "./fixtures";

// The page says when its /updates stream is down (src/web/connection.tsx).
// The browser holds the stream's requests: failing them is the server out
// of reach, and passing them on again is it coming back.

/**
 * Datastar's retries wait 1 s, then twice as long each time; a few of them
 * fit in this (OPEN_UPDATES in src/web/connection.tsx).
 */
test.describe.configure({ timeout: 30_000 });

function isUpdates(url: URL): boolean {
  return url.pathname === "/updates";
}

test("a tab says when it is not live, and comes back", async ({ page }) => {
  await test.step("a page that cannot reach the server says it is reconnecting, until it is live again", async () => {
    let reachable = false;
    await page.route(isUpdates, async (route) => {
      await (reachable ? route.continue() : route.abort("connectionrefused"));
    });
    await page.goto("/");
    // The page itself came, so it still shows what it had.
    await expect(page.getByRole("heading", { name: /^Count:/ })).toBeVisible();
    const reconnecting = page.getByText("Reconnecting…");
    await expect(reconnecting).toBeVisible();

    // Datastar keeps retrying; the next attempt gets through.
    reachable = true;
    await expect(reconnecting).toBeHidden();
    await expect(page.getByText("Disconnected.")).toBeHidden();
    await page.unroute(isUpdates);
  });

  await test.step("a stream that stopped for good offers a reload", async () => {
    // A 204 is an answer Datastar never retries.
    await page.route(isUpdates, async (route) => {
      await route.fulfill({ status: 204 });
    });
    await page.reload();
    await expect(page.getByText("Disconnected.")).toBeVisible();
    await expect(page.getByText("Reconnecting…")).toBeHidden();

    await page.unroute(isUpdates);
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Reload" }).click();
    await reloaded;
    // Live again: a change made through the page arrives over its stream.
    const heading = page.getByRole("heading", { name: /^Count:/ });
    const before = Number((await heading.textContent())?.replace(/\D/g, ""));
    await page.getByRole("button", { name: "Increment" }).click();
    await expect(
      page.getByRole("heading", { name: `Count: ${before + 1}` }),
    ).toBeVisible();
    await expect(page.getByText("Disconnected.")).toBeHidden();
  });
});
