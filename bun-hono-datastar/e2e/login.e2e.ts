import type { Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_PASSWORD_HASH } from "./constants";
import { expect, test } from "./fixtures";

// The opt-in password gate (src/web/auth.tsx), on: these tests get servers
// of their own with AUTH_PASSWORD_HASH set.
test.use({ passwordHash: E2E_PASSWORD_HASH });

async function signIn(page: Page, password: string): Promise<void> {
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Someone opens the app on a new browser, gets the password wrong once,
// signs in and uses it, finds another browser still signed in and signs it
// out, then signs out themselves.
test("signing in, using the app, revoking a device and signing out", async ({
  page,
  browser,
}, testInfo) => {
  await test.step("an unauthenticated visit goes through the login form to the page", async () => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);

    await signIn(page, "not the password");
    await expect(page.getByRole("alert")).toHaveText("Wrong password.");

    await signIn(page, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByTestId("device").filter({ hasText: "This device" }),
    ).toHaveCount(1);
  });

  await test.step("the signed-in page is live", async () => {
    await page.getByRole("link", { name: "Counter" }).click();
    const heading = page.getByRole("heading", { name: /^Count: \d+$/ });
    const start = Number((await heading.textContent())?.replace(/\D/g, ""));
    const increment = page.getByRole("button", { name: "Increment" });
    await increment.click();
    // Not busy any more only once the new count is on the page.
    await expect(increment).not.toHaveAttribute("aria-busy");
    expect(
      await page
        .getByRole("heading", { name: `Count: ${start + 1}`, exact: true })
        .isVisible(),
    ).toBe(true);
    await page.getByRole("link", { name: "Settings" }).click();
  });

  // The full user agent shows on hover, which tells this test's other
  // browser apart.
  const userAgent = `Mozilla/5.0 (e2e ${testInfo.project.name} ${crypto.randomUUID()})`;
  const other = await browser.newContext({ userAgent });
  const otherPage = await other.newPage();

  await test.step("another browser signs in and keeps the page open", async () => {
    const streamOpened = otherPage.waitForResponse(
      (response) => new URL(response.url()).pathname === "/updates",
    );
    await otherPage.goto("/");
    await signIn(otherPage, E2E_PASSWORD);
    await expect(otherPage).toHaveURL((url) => url.pathname === "/");
    await streamOpened;
  });

  await test.step("revoking it ends its open page and its access", async () => {
    // The open settings page lists it as soon as it signed in.
    const row = page
      .getByTestId("device")
      .filter({ has: page.getByTitle(userAgent, { exact: true }) });
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row).toHaveCount(0);

    // The open page's stream ends and sends it to the login form at once.
    await expect(otherPage).toHaveURL(/\/login\?next=%2F$/);
    // And its cookie no longer opens anything.
    const action = await otherPage.request.post("/actions/increment", {
      headers: { origin: new URL(otherPage.url()).origin },
    });
    expect(action.status()).toBe(401);
  });
  await other.close();

  await test.step("signing out returns to the login form", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });
});
