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

  await test.step("a click re-renders the page over its stream", async () => {
    const increment = page.getByRole("button", { name: "Increment" });
    await increment.click();
    await expect(count(page, start + 1)).toBeVisible();
    // The post answered once the render was on the stream: not busy any more.
    await expect(increment).not.toHaveAttribute("aria-busy", "true");
  });

  await test.step("the other tab gets the change without reloading", async () => {
    await expect(count(other, start + 1)).toBeVisible();
    await other.getByRole("button", { name: "Increment" }).click();
    await expect(count(page, start + 2)).toBeVisible();
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
