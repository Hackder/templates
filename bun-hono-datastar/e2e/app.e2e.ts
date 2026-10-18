import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

function count(tab: Page, n: number): Locator {
  return tab.getByRole("heading", { name: `Count: ${n}`, exact: true });
}

// The count is the worker's server's state, so other tests in the worker
// may have moved it: the flow starts from whatever it is.
test("every tab shows the shared count live", async ({ page, context }) => {
  const other = await context.newPage();
  let start = 0;

  await test.step("both tabs load the page", async () => {
    await page.goto("/");
    const heading = page.getByRole("heading", { name: /^Count: \d+$/ });
    start = Number((await heading.textContent())?.replace(/\D/g, ""));
    await other.goto("/");
    await expect(count(other, start)).toBeVisible();
  });

  const increment = page.getByRole("button", { name: "Increment" });

  // The button is busy (spins) from its click until the tab's stream says
  // its action is done, which the stream says after the render with the
  // action's result (src/web/busy.ts; that order is unit-tested in
  // src/web/updates.test.ts). So once it is no longer busy, the new count
  // is already on the page: checked once, not waited for. The click sets
  // it busy before it returns.
  await test.step("a click re-renders the page over its stream", async () => {
    await increment.click();
    await expect(increment).not.toHaveAttribute("aria-busy");
    expect(await count(page, start + 1).isVisible()).toBe(true);
  });

  await test.step("the other tab gets the change without reloading", async () => {
    await expect(count(other, start + 1)).toBeVisible();
    await other.getByRole("button", { name: "Increment" }).click();
    await expect(count(page, start + 2)).toBeVisible();
  });

  // Datastar retries a request whose answer the network lost, with the
  // same request id. Here the browser's request is sent twice before its
  // answer is delivered: the server runs it once.
  await test.step("a retried click counts once", async () => {
    const retried = Promise.withResolvers<undefined>();
    await page.route("**/actions/increment", async (route) => {
      await route.fetch();
      await route.fulfill({ response: await route.fetch() });
      retried.resolve(undefined);
    });
    await increment.click();
    await retried.promise;
    await page.unroute("**/actions/increment");
    await expect(increment).not.toHaveAttribute("aria-busy");
    // A second run would land before the next click's result: the next
    // count shows one more, not two.
    await increment.click();
    await expect(increment).not.toHaveAttribute("aria-busy");
    expect(await count(page, start + 4).isVisible()).toBe(true);
  });
});

test("queries the database with a Temporal-derived bound", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText(/^0 items stored in the last 24 hours$/),
  ).toBeVisible();
});

test("serves vendored browser dependencies", async ({ page }) => {
  const datastar = page.waitForResponse((response) =>
    response.url().endsWith("/static/datastar-1.0.4.js"),
  );
  const phosphor = page.waitForResponse((response) =>
    response.url().includes("/static/icons-2.1.2/Phosphor-Bold.woff2"),
  );

  await page.goto("/");

  expect((await datastar).ok()).toBe(true);
  expect((await phosphor).ok()).toBe(true);
});

test("runs custom Datastar plugins", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const pushUrl = document.createElement("div");
    pushUrl.setAttribute("data-push-url", "/plugin-target");
    document.body.append(pushUrl);
  });

  await expect(page).toHaveURL(/\/plugin-target$/);
});
