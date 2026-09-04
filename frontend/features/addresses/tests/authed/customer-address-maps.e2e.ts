import { test, expect } from "@playwright/test";

// The Google Places lookup inside the address drawer - the path most real
// customers take.
//
// @maps, AND EXCLUDED BY DEFAULT. Every keystroke in the autocomplete is a
// billed Places request, so `pnpm e2e` runs with --grep-invert @maps and this
// only executes under `pnpm e2e:maps`, on purpose, occasionally - after
// touching the drawer, the autocomplete, or the lookup endpoints, not on every
// change to everything else.
//
// THE BILLED CALL IS THE SERVER'S NOW (places lane). The browser holds no key
// and no SDK: typing hits GET /api/addresses/suggestions and choosing hits
// /suggestions/:place_id. So this spec needs GOOGLE_PLACES_API_KEY set on the
// API, not NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the page - the page still loads
// the Maps SDK, but only to draw the map.
//
// The two specs that used to sit beside this one - customer-address-crud and
// customer-addresses - are DELETED: their claims are made against the API
// itself in domain/places/addresses/tests/journeys/address-crud.test.ts, which
// says so in its own header.
test("@maps the Places lookup offers suggestions and fills the form", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/account");
  await page.getByRole("button", { name: /^Addresses$/i }).click();
  await page.getByText(/Add New/i).first().click();

  const dialog = page.getByRole("dialog", { name: /Address/i }).first();
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  // The lookup input is the drawer's opening state.
  const search = dialog.getByRole("combobox", { name: /find address/i }).first();
  await expect(search, "the drawer offers no address lookup input").toBeVisible({
    timeout: 15_000,
  });

  // One query, typed once - a single autocomplete session, the cheapest
  // shape a billed interaction can take.
  await search.fill("6100 Main St, Houston");

  const suggestion = page
    .getByRole("option")
    .or(page.locator('[class*="suggestion"], [class*="autocomplete"] li'))
    .first();
  await expect(suggestion, "the Places lookup returned no suggestions").toBeVisible({
    timeout: 20_000,
  });
  await suggestion.click();

  // Choosing a suggestion must populate the postal fields - that is the whole
  // point of the lookup. line_1 carrying the street is the load-bearing one.
  await expect
    .poll(async () => (await dialog.locator('[name="line_1"]').inputValue().catch(() => "")) !== "", {
      message: "choosing a suggestion did not fill line_1",
      timeout: 15_000,
    })
    .toBeTruthy();
});
