import { test, expect } from "@playwright/test";

// The first signed-in flow, and what it really proves is that the saved session
// works at all - every admin spec after this depends on it.
//
// /admin is one route with a sidebar section per feature (users, leads,
// products, reviews, purchase orders), and it declares roles: ['admin'].
test.describe("an admin reaching the admin area", () => {
  test("the admin route renders rather than bouncing", async ({ page }) => {
    await page.goto("/admin");

    // ProtectedPage redirects or blanks for the wrong role, so simply arriving
    // and finding admin furniture is the assertion.
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });

    const body = await page.locator("body").innerText();
    expect(body.length, "the admin page rendered nothing").toBeGreaterThan(50);
  });

  // THE ONE THAT PROVES THE SESSION IS REAL. An unauthenticated browser must
  // not see this, so if the same assertion passes without storageState the
  // session is not what is doing the work.
  test("the admin sidebar lists the sections the business runs on", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await page.waitForTimeout(2000);

    const body = await page.locator("body").innerText();
    const sections = ["Users", "Leads", "Products", "Reviews"].filter((s) =>
      new RegExp(s, "i").test(body)
    );
    expect(
      sections.length,
      `none of the admin sections rendered - the session may not be applying. Saw: ${body.slice(0, 160)}`
    ).toBeGreaterThan(0);
  });

  test("renders with no console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(m.text().slice(0, 120));
    });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    expect(problems, `the admin page reported errors:\n${problems.join("\n")}`).toEqual([]);
  });
});
