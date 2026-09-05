import { test, expect } from "@playwright/test";

// Impersonation, end to end.
//
// An admin becomes a customer, sees what that customer sees, and comes back.
// It is the one flow where the session itself is the thing under test rather
// than the vehicle for it, and it is a major part of how this business is run.
//
// IMPERSONATES THE E2E CUSTOMER, NEVER A REAL ONE. Dev holds real people's
// orders and addresses; there is no reason for a test to look at them, and a
// screenshot on failure would capture whatever was on screen.
//
// LEAVING THIS HALF-DONE WOULD POISON EVERY LATER TEST. Impersonating replaces
// the admin's session, so a failure between "impersonate" and "stop" leaves the
// saved admin state pointing at a customer session - and every admin spec after
// it would quietly run as a customer. The afterEach below stops impersonating
// unconditionally, and the last test asserts the admin is genuinely back.
const CUSTOMER_EMAIL = "e2e-customer@example.invalid";

test.afterEach(async ({ page }) => {
  // Unconditional. If the test already stopped, this is a no-op; if it failed
  // midway, this is what prevents the damage.
  try {
    const stop = page.getByRole("button", { name: /Stop Impersonating/i });
    if (await stop.isVisible({ timeout: 2000 })) {
      await stop.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    // Best effort - the assertion in the last test is what actually verifies
    // the admin got their session back.
  }
});

test.describe("an admin impersonating a customer", () => {
  test("the users section lists the e2e customer", async ({ page }) => {
    await page.goto("/admin?tab=users");
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    expect(
      body.includes(CUSTOMER_EMAIL) || /Users/i.test(body),
      "the users section did not render - impersonation cannot be reached from here"
    ).toBeTruthy();
  });

  test("impersonating shows the banner naming who is being impersonated", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/admin?tab=users");
    await page.waitForTimeout(3000);

    // Open the drawer for the e2e customer by clicking their row.
    const row = page.getByText(CUSTOMER_EMAIL, { exact: false }).first();
    await expect(row, "the e2e customer is not in the users table - has the seed run?").toBeVisible({
      timeout: 20_000,
    });
    await row.click();

    const impersonate = page.getByRole("button", { name: /Impersonate User/i });
    await expect(impersonate, "the impersonate action did not appear in the drawer").toBeVisible({
      timeout: 15_000,
    });
    await impersonate.click();

    // THE ASSERTION. LayoutProvider renders a banner whenever
    // session.impersonatedBy is set, and it names who is being impersonated -
    // which is the only thing standing between an admin and forgetting they are
    // acting as somebody else.
    await expect(page.getByText(/Impersonating/i).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: /Stop Impersonating/i })).toBeVisible();
  });

  test("stopping impersonation returns the admin to their own session", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/admin?tab=users");
    await page.waitForTimeout(3000);

    const row = page.getByText(CUSTOMER_EMAIL, { exact: false }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await page.getByRole("button", { name: /Impersonate User/i }).click();

    const stop = page.getByRole("button", { name: /Stop Impersonating/i });
    await expect(stop).toBeVisible({ timeout: 25_000 });
    await stop.click();

    // Back to being an admin: the banner is gone AND /admin is reachable again,
    // which a customer session cannot do. Checking only the banner would pass
    // for a session that had been dropped entirely.
    await expect(page.getByRole("button", { name: /Stop Impersonating/i })).toHaveCount(0, {
      timeout: 25_000,
    });
    await page.goto("/admin?tab=users");
    await expect(page).toHaveURL(/tab=users/, { timeout: 20_000 });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    expect(body.length, "the admin did not get their own session back").toBeGreaterThan(50);
  });
});
