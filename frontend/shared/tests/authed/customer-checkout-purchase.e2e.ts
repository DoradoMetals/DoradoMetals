import { test, expect } from "@playwright/test";

// The purchase-order checkout journey, from the sell catalogue to the
// stepper - the path every dollar the business pays out starts on.
//
// Cross-feature by nature (products, cart, checkout, addresses), so it lives
// in shared/tests per the config's own rule.
//
// IT STOPS AT THE BRINK, DELIBERATELY. Placing a purchase order creates real
// rows in dev, can generate a FedEx label and an email, and cleaning a placed
// order back out needs the six-table cascade that purgeCancelled never got.
// So this walks the surface a customer walks - add to sell cart, cart drawer,
// the checkout stepper - and asserts each hand-off happened, without
// submitting. The five 'Pending' husks deleted on 2026-08-31 are what
// unfinished creates look like in dev; this suite must not mint more.
// Full placement wants a seeded disposable order and a cascade cleanup -
// the same infrastructure the admin drawer spec already names as missing.
//
// WRITES COMMIT (the cart is real), so the sell cart is cleared through the
// API afterwards - sync replaces wholesale, so an empty sync is a clear.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");

test.afterEach(async ({ request }) => {
  try {
    await request.post(`${API}/cart/sync_sell_cart`, { data: { cart: [] } });
  } catch {
    // Best effort - a leftover cart line is visible in the drawer and harmless.
  }
});

test("bullion and scrap added on /sell reach the checkout stepper", async ({ page }) => {
  test.setTimeout(150_000);

  // BULLION first. The sell catalogue prices through /quotes/*, so cards can
  // take a moment.
  await page.goto("/sell");
  const addButton = page.getByRole("button", { name: /^Add to Sell Cart$/i }).first();
  await expect(addButton, "no sellable product card rendered on /sell").toBeVisible({
    timeout: 30_000,
  });
  await addButton.click();

  // SCRAP second - a purchase order carries both kinds, and a spec that only
  // ever sells bullion never notices the scrap intake breaking (Jacob's ask).
  // The form arrives with Gold and Grams pre-selected, so the weight is the
  // one required entry. Its input carries no name attribute - the form is
  // FormField-controlled - so the placeholder is the stable handle. The tab
  // is CLICKED, not reached by ?tab=scrap: the URL param races hydration and
  // intermittently leaves the page on Bullion.
  await page.getByRole("tab", { name: /^Scrap$/i }).click();
  // The weight is a FloatingLabelInput: "Enter Weight" is a floating LABEL
  // element, not a placeholder attribute, and type="number" means no textbox
  // role either - so the input element itself is the stable handle.
  const weight = page.locator('input[type="number"]').first();
  await expect(weight, "the scrap form never rendered").toBeVisible({ timeout: 20_000 });
  await weight.fill("10");
  await page.getByRole("button", { name: /^Add Item$/i }).click();

  // The scrap stepper lands on its Review step once the item is in - the
  // 'Add Another' control appearing is the sign the add took.
  await expect(
    page.getByRole("button", { name: /Add Another/i }).first(),
    "the scrap item was never accepted"
  ).toBeVisible({ timeout: 15_000 });

  // The cart drawer, on its sell side, now carrying TWO kinds. The tab names
  // carry live counts - "Sell Cart (2)" - so match on the prefix.
  await page.getByRole("button", { name: /open cart/i }).click();
  await page.getByRole("tab", { name: /Sell Cart/i }).click();

  // The scrap line is named "<Metal> Item N" by assignScrapItemNames; the
  // bullion line carries its product name. Both being present is the point.
  await expect(
    page.getByText(/Gold Item/i).first(),
    "the scrap line never reached the sell cart"
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByText(/Price Estimate/i).first(),
    "the sell cart shows no price estimate for the added item"
  ).toBeVisible({ timeout: 20_000 });

  // The estimate must be a real rendered price. Prices render through
  // NumberFlow custom elements whose digits do NOT appear in innerText - a
  // $-regex over body text matches nothing even when every price is correct
  // (found the hard way). The element being present and visible is the
  // assertion innerText cannot make.
  await expect(
    page.locator("number-flow-react").first(),
    "the sell cart rendered no price element"
  ).toBeVisible({ timeout: 15_000 });

  // Signed in, the proceed button reads 'Sell Your Items' and lands on the
  // stepper. Anonymous it reads 'Sign In to...' - so this asserting the
  // signed-in label also asserts the session survived the journey.
  await page.getByRole("button", { name: /^Sell Your Items$/i }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });

  // The stepper's first step. Its h2 carries the current step title.
  await expect(
    page.getByRole("heading", { name: /Shipping/i }).first(),
    "the checkout stepper did not open on its Shipping step"
  ).toBeVisible({ timeout: 20_000 });

  // The shipping step offers the customer's addresses or the way to add one.
  // Either is a correct state for the e2e account; a blank panel is not.
  await expect(
    page.getByText(/Add New|Address/i).first(),
    "the Shipping step offers neither an address nor a way to add one"
  ).toBeVisible({ timeout: 15_000 });
});
