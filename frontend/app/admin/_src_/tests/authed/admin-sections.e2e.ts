import { test, expect } from "@playwright/test";

// Every admin section, reachable and rendering.
//
// /admin is one route with thirteen sidebar sections selected by ?tab=. That
// makes them cheap to cover and worth covering: each one mounts a different
// feature's table, so a section that throws takes out an entire area of the
// business with nothing else noticing. This is the breadth pass - the depth
// tests (creating a lead, impersonating a user) live beside their own features.
const SECTIONS = [
  "users",
  "leads",
  "bullion",
  "reviews",
  "rates",
  "purchase-orders",
  "sales-orders",
  "carriers",
  "carrier_services",
  "appointments",
  "metrics",
  "expenses",
  "profits",
] as const;

for (const tab of SECTIONS) {
  test(`the ${tab} section renders without throwing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 140));
    });
    page.on("pageerror", (e) => errors.push(`uncaught: ${String(e.message).slice(0, 140)}`));

    await page.goto(`/admin?tab=${tab}`);
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`), { timeout: 20_000 });

    // Let the section's queries resolve. Admin tables fetch on mount.
    await page.waitForTimeout(2500);

    const body = await page.locator("body").innerText();
    expect(
      body.length,
      `the ${tab} section rendered an empty page - it may be throwing during render`
    ).toBeGreaterThan(50);

    // An uncaught error is the failure that matters here: it means the section
    // is broken for every admin, and nothing in the API suite would see it.
    const uncaught = errors.filter((e) => e.startsWith("uncaught:"));
    expect(uncaught, `${tab} threw during render:\n${uncaught.join("\n")}`).toEqual([]);
  });
}
