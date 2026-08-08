import { expect, test } from "@playwright/test";

test("updates server-rendered JSX through Datastar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Count: 0" })).toBeVisible();

  await page.getByRole("button", { name: "Increment" }).click();

  await expect(page.getByRole("heading", { name: "Count: 1" })).toBeVisible();
});

test("serves vendored browser dependencies", async ({ page }) => {
  const datastar = page.waitForResponse((response) =>
    response.url().endsWith("/static/datastar-1.0.2.js"),
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
    const countdown = document.createElement("span");
    countdown.id = "countdown";
    countdown.setAttribute(
      "data-countdown",
      String(performance.timeOrigin + performance.now() + 65_000),
    );
    document.body.append(countdown);

    const pushUrl = document.createElement("div");
    pushUrl.setAttribute("data-push-url", "/plugin-target");
    document.body.append(pushUrl);
  });

  await expect(page.locator("#countdown")).toHaveText(/^1:0[0-5]$/);
  await expect(page).toHaveURL(/\/plugin-target$/);
});
