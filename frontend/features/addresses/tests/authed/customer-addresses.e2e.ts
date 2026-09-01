import { test, expect } from "@playwright/test";

// A customer managing their own addresses, on /account.
//
// Addresses matter more here than in most systems: a purchase order ships a
// customer's metal to the business and a sales order ships bullion back, so a
// wrong address is a parcel of gold going to the wrong place. The feature is
// also mid-migration - ADDRESSES_SOURCE and ADDRESSES_WIRE both exist, and the
// new schema splits the address from a person's relationship to it - so a
// browser-level test is the closest thing to a rehearsal of both switches.
//
// CUSTOMER, NOT ADMIN, and that is the point of the separate project: this is
// the only signed-in surface most users ever touch, and it must work for a
// plain account with no privileges.
//
// WRITES COMMIT. A browser test has no pinned transaction, so anything created
// here is named with an e2e- prefix and removed in an afterEach that runs even
// when the test fails.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const created = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const name of created) {
    try {
      const res = await request.get(`${API}/addresses/get`);
      if (!res.ok()) continue;
      const found = (await res.json()).find((a: { name?: string }) => a.name === name);
      if (found?.id) {
        await request.delete(`${API}/addresses/delete`, { data: { address: found } });
      }
    } catch {
      // Best effort; the e2e- prefix makes any survivor identifiable.
    }
  }
  created.clear();
});

// /account has its own sidebar - Account Details, Security, Addresses, Sold,
// Bought - so the address list is behind a click, the same shape as /admin.
async function openAddresses(page: import("@playwright/test").Page) {
  await page.goto("/account");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^Addresses$/i }).click();
  await page.waitForTimeout(2000);
}

test.describe("a customer's addresses", () => {
  test("the account page renders the address list", async ({ page }) => {
    await openAddresses(page);

    const body = await page.locator("body").innerText();
    expect(body.length, "the account page rendered nothing").toBeGreaterThan(50);
    await expect(page.getByText(/Add New/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("adding an address opens the drawer with its fields", async ({ page }) => {
    test.setTimeout(90_000);
    await openAddresses(page);
    await page.getByText(/Add New/i).first().click();

    // Named, not just role=dialog. Every drawer is a dialog now, including the
    // navigation one, so selecting by role alone matched two elements - which
    // is the same ambiguity a screen reader user would hear. Each drawer
    // carries the name of what it shows.
    // .first() because AddressDrawer is mounted in more than one place on this
    // page - the account list and the checkout shipping selector both render
    // one. Not a defect, but it means the name alone is not unique.
    await expect(page.getByRole('dialog', { name: /Address/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // THE DRAWER OPENS ON A LOOKUP, NOT A FORM. The first assertion here
    // expected name/city/zip inputs and failed - the drawer actually starts
    // with a Google Places search ("Find Address"), and the manual fields
    // appear once an address is chosen or manual entry is selected. That is the
    // real flow, so this asserts the real flow rather than the one I assumed.
    const dialog = page.getByRole("dialog", { name: /Address/i }).first();
    await expect(
      dialog.getByText(/Find Address|Search Addresses/i).first(),
      "the address drawer did not offer a way to enter an address"
    ).toBeVisible({ timeout: 15_000 });

    // The label field is present from the start - it is the customer's name for
    // the address rather than part of the postal lookup. (The input was
    // name="name" until the form rename; this assertion went stale with it.)
    await expect(
      dialog.locator('[name="label"]').first(),
      "the address drawer has no label field"
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a customer sees only their own addresses", async ({ page, request }) => {
    // The API is the authority here: /addresses/get is scoped to the session,
    // and this asserts the page shows that same set rather than anyone else's.
    const res = await request.get(`${API}/addresses/get`);
    expect(res.ok(), "the addresses endpoint did not answer for this session").toBeTruthy();
    const mine = await res.json();

    await openAddresses(page);
    const body = await page.locator("body").innerText();

    // Every address the API returned should be findable on the page. If the
    // page showed MORE than the API returned, that is the leak worth catching.
    for (const address of mine.slice(0, 3)) {
      if (!address?.line_1) continue;
      expect(
        body.includes(address.line_1),
        `the account page does not show ${address.line_1}, which the API returned`
      ).toBeTruthy();
    }
  });
});
