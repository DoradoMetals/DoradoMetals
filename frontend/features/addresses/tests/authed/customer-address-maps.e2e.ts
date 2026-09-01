import { test, expect } from "@playwright/test";

// The Google Places lookup inside the address drawer - the path most real
// customers take, and the one the CRUD spec deliberately avoids.
//
// @maps, AND EXCLUDED BY DEFAULT. Every keystroke in the autocomplete is a
// billed Places request, so `pnpm e2e` runs with --grep-invert @maps and this
// only executes under `pnpm e2e:maps`, on purpose, occasionally - after
// touching the drawer, the autocomplete, or the Maps loader, not on every
// change to everything else.
test("@maps the Places lookup offers suggestions and fills the form", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/account");
  await page.getByRole("button", { name: /^Addresses$/i }).click();
  await page.getByText(/Add New/i).first().click();

  const dialog = page.getByRole("dialog", { name: /Address/i }).first();
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  // The lookup input is the drawer's opening state.
  const search = dialog
    .locator('input[placeholder*="ddress" i], input[aria-label*="ddress" i]')
    .first();
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
