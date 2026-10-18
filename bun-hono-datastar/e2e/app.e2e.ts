import { expect, test } from "@playwright/test";

test("updates server-rendered JSX through Datastar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Count: 0" })).toBeVisible();

  await page.getByRole("button", { name: "Increment" }).click();

  await expect(page.getByRole("heading", { name: "Count: 1" })).toBeVisible();
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
