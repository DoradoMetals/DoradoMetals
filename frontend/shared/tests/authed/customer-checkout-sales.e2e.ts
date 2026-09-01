import { test, expect } from "@playwright/test";

// The sales-order checkout journey - the buy side: catalogue, buy cart,
// /sales-order-checkout.
//
// STOPS BEFORE PAYMENT, DELIBERATELY. A sales order is born against a Stripe
// intent; even in test mode a submitted one creates rows that need the
// reconcile machinery to unwind. So this walks add-to-cart, the drawer, and
// the checkout hand-off, and asserts the checkout surface came up priced -
// without confirming anything.
//
// The buy cart is cleared through the API afterwards - sync replaces
// wholesale, so an empty sync is a clear.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");

test.afterEach(async ({ request }) => {
  try {
    await request.post(`${API}/cart/sync_cart`, { data: { cart: [] } });
  } catch {
    // Best effort - a leftover cart line is visible in the drawer and harmless.
  }
});

test("a product added on /buy reaches the sales-order checkout", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/buy");
  const addButton = page.getByRole("button", { name: /^Add to Cart$/i }).first();
  await expect(addButton, "no buyable product card rendered on /buy").toBeVisible({
    timeout: 30_000,
  });
  await addButton.click();

  // The drawer opens on the buy side; the tab click makes the intent explicit
  // rather than relying on the default.
  await page.getByRole("button", { name: /open cart/i }).click();
  await page.getByRole("tab", { name: /Buy Cart/i }).click();

  // A real rendered price on the line. NumberFlow digits are invisible to
  // innerText, so presence of the price element is the honest assertion here
  // (same lesson as the purchase spec).
  await expect(
    page.locator("number-flow-react").first(),
    "the buy cart rendered no price element"
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
