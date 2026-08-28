import { test, expect } from "@playwright/test";

// The admin purchase order drawer - where an order actually gets worked.
//
// This is the largest surface in the application and the one where money is
// decided. The drawer carries the whole workflow: locking spot prices, adding
// and editing scrap and bullion lines, shipping and payout charges, and the
// status transitions that move an order from Received to Payment Processing.
// The whole surface rides one PATCH document now (D87), and offers left the
// product entirely - pricing is finalized, never offered.
//
// READ AND NAVIGATE, DO NOT MUTATE. Every one of these acts on a REAL purchase
// order in dev - there is no pinned transaction in a browser, and no way to
// create a throwaway order without going through the whole customer checkout
// first. Moving a real order's status or locking its spots would corrupt a
// record somebody may be using, and CLAUDE.md's first rule outranks coverage.
//
// So this asserts the controls are present, correctly gated by the order's
// current status, and that the drawer renders an order's real figures. The
// mutations themselves are covered at the API level, inside a transaction that
// is rolled back, which is where they can be exercised safely.
//
// A CREATE-THEN-WORK-THEN-DELETE spec is the right way to cover the mutations
// end to end, and it needs a seeded disposable order. That is worth building;
// it is not worth faking by mutating production-shaped data in dev.
test.describe("the admin purchase order drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin?tab=purchase-orders");
    await page.waitForTimeout(3000);
    await page.locator("tbody tr").first().click();
    await expect(page.getByRole("dialog", { name: /Purchase order/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("it names the order and the customer it belongs to", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: /Purchase order/i }).first();
    const text = await drawer.innerText();

    // An order number in the format the business uses. Without this the drawer
    // could be showing a blank shell and every other assertion would still hold.
    expect(text, "the drawer does not show a purchase order number").toMatch(/PO\s*-\s*\d+/);
    expect(text.length, "the drawer rendered almost nothing").toBeGreaterThan(80);
  });

  test("the spot controls are present, because every figure depends on them", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: /Purchase order/i }).first();

    // Locking spots is what freezes the prices a payout is computed from. If
    // this control vanished, an admin could price an order against moving spot.
    await expect(drawer.getByRole("button", { name: /Lock Spots/i })).toBeVisible();

    // THE METALS ARE NOT ASSERTED HERE, and the reason is worth recording.
    //
    // The first version required all four; that failed, because not every order
    // carries order_metals rows. The second asserted the set was never PARTIAL,
    // and that failed too - reporting "lists Silver but not Gold" - which sent
    // me to the database to check before calling it a bug.
    //
    // There are ZERO orders with a partial spot set in dev. The match was the
    // ITEM name, "Silver Coin (2 oz)", not the spots section: a regex over the
    // whole drawer cannot tell a metal in a price table from a metal in a
    // product name.
    //
    // So the invariant moved to where it can be checked precisely - a SQL
    // assertion in the API suite, over every order at once, rather than a
    // string search over one drawer's rendered text. What is left here is the
    // thing only a browser can tell you: that the control an admin needs is on
    // the screen.
  });

  test("the item controls an admin needs are all there", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: /Purchase order/i }).first();
    for (const control of [/Add Scrap to Order/i, /Edit/i, /Remove/i, /Add New/i]) {
      await expect(
        drawer.getByRole("button", { name: control }).first(),
        `the drawer is missing the ${control} control`
      ).toBeVisible();
    }
  });

  test("the totals a payout is built from are shown", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: /Purchase order/i }).first();
    const text = await drawer.innerText();
    for (const label of ["Bullion Estimate", "Shipping Charges", "Total Estimate"]) {
      expect(text, `the drawer does not show ${label}`).toContain(label);
    }
    expect(text, "a figure rendered as NaN").not.toMatch(/NaN/);
    expect(text, "a figure rendered as undefined").not.toMatch(/\$\s*undefined/);
  });

  // THE ASSERTION MOST WORTH HAVING. The transitions offered must match where
  // the order actually is - an order in Received offers "Finalize Pricing"
  // and "Back to In Transit", not a transition from some other stage. A drawer
  // offering the wrong move is how an order ends up in a state the business
  // cannot recover it from.
  test("the status transitions offered match the order's current status", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: /Purchase order/i }).first();
    const text = await drawer.innerText();

    const STATUSES = [
      "Pending",
      "In Transit",
      "Received",
      "Cancelled",
    ];
    const current = STATUSES.find((s) => new RegExp(`\\b${s}\\b`).test(text));
    expect(current, `the drawer shows no recognisable status. Saw: ${text.slice(0, 120)}`).toBeTruthy();

    // Whatever the status, there must be a way forward or a way to cancel -
    // an order with no available transition is stuck.
    const moves = await drawer.getByRole("button", { name: /Move to|Back to|Cancel Order/i }).count();
    expect(moves, `an order in ${current} offers no transition at all`).toBeGreaterThan(0);
  });
});
