import { expect, test } from "./fixtures";

test("every tab shows the shared count live", async ({ page, context }) => {
  const other = await context.newPage();

  await test.step("both tabs load the page", async () => {
    await page.goto("/");
    await other.goto("/");
    await expect(page.getByRole("heading", { name: "Count: 0" })).toBeVisible();
    await expect(
      other.getByRole("heading", { name: "Count: 0" }),
    ).toBeVisible();
  });

  await test.step("a click re-renders the page over its stream", async () => {
    const increment = page.getByRole("button", { name: "Increment" });
    await increment.click();
    await expect(page.getByRole("heading", { name: "Count: 1" })).toBeVisible();
    // The post answered once the render was on the stream: not busy any more.
    await expect(increment).not.toHaveAttribute("aria-busy", "true");
  });

  await test.step("the other tab gets the change without reloading", async () => {
    await expect(
      other.getByRole("heading", { name: "Count: 1" }),
    ).toBeVisible();
    await other.getByRole("button", { name: "Increment" }).click();
    await expect(page.getByRole("heading", { name: "Count: 2" })).toBeVisible();
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
