import { test, expect } from "@playwright/test";

// The sales-order checkout journey - the buy side: catalogue, the checkout
// basket, /sales-order-checkout.
//
// STOPS BEFORE PAYMENT, DELIBERATELY. A sales order is born against a Stripe
// intent; even in test mode a submitted one creates rows that need the
// reconcile machinery to unwind. So this walks add-to-checkout, the drawer,
// and the checkout hand-off, and asserts the checkout surface came up priced
// - without confirming anything.
//
// The sale basket is cleared through the API afterwards.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");

test.afterEach(async ({ request }) => {
  try {
    await request.delete(`${API}/checkout/items?direction=sale`);
  } catch {
    // Best effort - a leftover line is visible in the drawer and harmless.
  }
});

test("a product added on /buy reaches the sales-order checkout", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/buy");
  const addButton = page.getByRole("button", { name: /^Add to Checkout$/i }).first();
  await expect(addButton, "no buyable product card rendered on /buy").toBeVisible({
    timeout: 30_000,
  });
  await addButton.click();

  // The drawer opens on the buy (sale) side; the tab click makes the intent
  // explicit rather than relying on the default.
  await page.getByRole("button", { name: /open checkout/i }).click();
  await page.getByRole("tab", { name: /Buying/i }).click();

  // A real rendered price on the line. NumberFlow digits are invisible to
  // innerText, so presence of the price element is the honest assertion here
  // (same lesson as the purchase spec).
  await expect(
    page.locator("number-flow-react").first(),
    "the sale basket rendered no price element"
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Checkout$/i }).click();
  await expect(page).toHaveURL(/\/sales-order-checkout/, { timeout: 20_000 });

  // The checkout surface is up and it is the priced kind. Asserting a
  // specific step title would couple this to copy that is still being
  // reworked - checkout is slated for overhaul, and this spec should outlive
  // the reskin. So: the page rendered substance, and at least one price
  // element survived the hand-off (NumberFlow digits are invisible to
  // innerText, hence no $-regex).
  await expect
    .poll(async () => (await page.locator("body").innerText()).length > 200, {
      message: "the sales-order checkout rendered nearly nothing",
      timeout: 20_000,
    })
    .toBeTruthy();
  await expect(
    page.locator("number-flow-react").first(),
    "the sales-order checkout rendered no price element"
  ).toBeVisible({ timeout: 15_000 });
});
