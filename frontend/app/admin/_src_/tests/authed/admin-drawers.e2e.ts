import { test, expect } from "@playwright/test";

// Opening every admin drawer.
//
// Clicking a table row opens that feature's drawer, and there are twelve of
// them - users, leads, products, reviews, carriers, carrier services, purchase
// orders, sales orders, addresses, cart. Each renders a different tree of
// components against a different row's data, and a drawer that throws on open
// takes out the only way to act on that record.
//
// NOTHING ELSE SEES THIS. The API suite proves the endpoints answer; the
// section sweep proves the tables render. A drawer only mounts on a click, so
// it is invisible to both.
//
// READ-ONLY BY DESIGN. This opens and closes; it does not save. Editing lives
// in the specs for each feature, where a change can be made and undone
// deliberately. Opening is worth its own pass because it is where the render
// errors are, and because it is the cheapest thing to keep green.
const SECTIONS = [
  { tab: "users", what: "a user" },
  { tab: "leads", what: "a lead" },
  { tab: "bullion", what: "a product" },
  { tab: "reviews", what: "a review" },
  { tab: "purchase-orders", what: "a purchase order" },
  { tab: "sales-orders", what: "a sales order" },
  { tab: "carriers", what: "a carrier" },
  { tab: "carrier_services", what: "a carrier service" },
] as const;

for (const { tab, what } of SECTIONS) {
  test(`opening ${what} from the ${tab} table does not throw`, async ({ page }) => {
    test.setTimeout(60_000);

    const thrown: string[] = [];
    page.on("pageerror", (e) => thrown.push(String(e.message).slice(0, 160)));

    await page.goto(`/admin?tab=${tab}`);
    await page.waitForTimeout(3000);

    // Rows are rendered by the shared DataTable. Taking the first data row
    // rather than a specific record keeps this independent of what dev holds.
    const rows = page.locator("tbody tr");
    const count = await rows.count();

    // A section with no rows cannot be tested for drawer opening, and saying so
    // is better than passing silently - dev is supposed to have data here.
    test.skip(count === 0, `the ${tab} table has no rows in dev`);

    await rows.first().click();
    await page.waitForTimeout(2500);

    expect(
      thrown,
      `opening ${what} threw during render:\n${thrown.join("\n")}`
    ).toEqual([]);

    // Something has to have appeared. A drawer that opens to nothing is as
    // broken as one that throws, and passes an error-only assertion.
    // role=dialog, because a drawer IS a dialog. It had no role at all until
    // this sweep was written - two bare divs in a portal, unannounced to
    // assistive technology and not closable from the keyboard. Selecting it the
    // way a screen reader finds it is the point, not a convenience.
    const dialogish = page.getByRole('dialog');
    await expect(
      dialogish.first(),
      `no drawer appeared when opening ${what} - the row click may not be wired`
    ).toBeVisible({ timeout: 15_000 });
  });
}
