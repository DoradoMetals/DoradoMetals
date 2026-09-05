import { test, expect } from "@playwright/test";

// The admin users table - the section every other admin surface keys off,
// since orders and leads resolve their names from this list. READ AND
// NAVIGATE: these are real dev accounts, and the mutations (role changes,
// impersonation) are covered by admin-impersonation.e2e.ts and the API suite.
test.describe("the admin users table", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin?tab=users");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  });

  test("it lists accounts with names and emails", async ({ page }) => {
    const rows = page.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);

    // The e2e accounts always exist (the suite signed in as them), so the
    // table failing to show them is a real listing defect rather than data
    // that happens to be missing.
    await expect(
      page.getByText(/e2e-(admin|customer)@example\.invalid/).first(),
      "the users table does not show the e2e accounts"
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a row opens the user's drawer", async ({ page }) => {
    await page.locator("tbody tr").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    const text = await drawer.innerText();
    expect(text.length, "the user drawer rendered almost nothing").toBeGreaterThan(40);
  });
});
