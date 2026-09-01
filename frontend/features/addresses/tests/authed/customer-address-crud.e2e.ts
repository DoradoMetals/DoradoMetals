import { test, expect, type Page, type Locator } from "@playwright/test";

// The full life of an address: created, edited, deleted - through the drawer,
// as a customer.
//
// MANUAL ENTRY ONLY, AND THAT IS A COST DECISION. The drawer opens on a Google
// Places lookup, and every keystroke in that autocomplete is a billed Places
// request. The form's own 'Manual Entry' toggle exists precisely so an address
// can be typed without the lookup - so this spec uses it exclusively, and the
// autocomplete has its own @maps-tagged spec that the default `pnpm e2e` run
// excludes (see package.json: --grep-invert @maps).
//
// THE DRAWER IS MOUNTED TWICE (the account list and the checkout shipping
// selector both render an AddressDrawer), the spare parked offscreen, and
// WHICH mount comes first in the DOM varies between loads. Three rounds of
// .first()/.last() selection all lost to that race. So the strategy here is
// to stop picking: FILLS go to every mounted instance - they never hit-test,
// and identical data in a dead twin is harmless - and CLICKS pick the one
// instance whose box is actually inside the viewport.
//
// WRITES COMMIT. Everything created here carries the e2e-crud- prefix and is
// removed in afterEach through the API even when the test fails mid-way.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PREFIX = "e2e-crud-";

test.afterEach(async ({ request }) => {
  try {
    const res = await request.get(`${API}/addresses/get`);
    if (!res.ok()) return;
    for (const address of await res.json()) {
      // The FORM field is `label` but the WIRE field is `name` - the first
      // version filtered on label, matched nothing, and leaked three rows
      // while reporting success. Check both so a wire rename cannot silently
      // turn this back into a leak.
      if ((address?.name ?? address?.label)?.startsWith(PREFIX)) {
        await request.delete(`${API}/addresses/delete`, { data: { address } });
      }
    }
  } catch {
    // Best effort; the prefix keeps any survivor identifiable.
  }
});

async function fillEach(locator: Locator, value: string) {
  const n = await locator.count();
  expect(n, `nothing matched to fill with "${value}"`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await locator.nth(i).fill(value);
}

// The one instance of `locator` whose box intersects the viewport - the only
// one a person could click.
async function onScreen(page: Page, locator: Locator): Promise<Locator> {
  await expect(locator.first()).toBeAttached({ timeout: 20_000 });
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  for (let i = 0; i < (await locator.count()); i++) {
    const box = await locator.nth(i).boundingBox();
    if (box && box.x < vp.width && box.x + box.width > 0 && box.y < vp.height && box.y + box.height > 0) {
      return locator.nth(i);
    }
  }
  throw new Error("no matching element is inside the viewport");
}

async function openAddresses(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: /^Addresses$/i }).click();
  await expect(page.getByText(/Add New/i).first()).toBeVisible({ timeout: 20_000 });
}

// Flip every mounted drawer to manual mode - IF a flip is needed. A fresh
// drawer opens on the Places lookup and offers 'Manual Entry'; an EXISTING
// address opens already manual (the toggle reads 'Search for Address'), so
// waiting for the button there is waiting forever. Clicking every mounted
// toggle is deliberate: each mount has its own state, the flip is
// one-directional here, and force skips the sticky-element hit test that
// blocked plain clicks for three minutes.
async function ensureManualMode(page: Page) {
  const line1 = page.locator('[name="line_1"]');
  const toggles = page.getByRole("button", { name: /^Manual Entry$/i });
  await expect(toggles.first().or(line1.first())).toBeAttached({ timeout: 20_000 });
  for (let i = 0; i < (await toggles.count()); i++) {
    await toggles.nth(i).click({ force: true }).catch(() => {});
  }
  await expect(line1.first()).toBeAttached({ timeout: 10_000 });
}

test("an address is created manually, edited, and deleted", async ({ page }) => {
  test.setTimeout(180_000);
  const label = `${PREFIX}${Date.now()}`;

  await openAddresses(page);

  // CREATE, typed by hand - no lookup, no billed request.
  await page.getByText(/Add New/i).first().click();
  await ensureManualMode(page);
  await fillEach(page.locator('[name="label"]'), label);
  await fillEach(page.locator('[name="line_1"]'), "6100 Main St");
  await fillEach(page.locator('[name="city"]'), "Houston");
  await fillEach(page.locator('[name="zip"]'), "77005");
  await fillEach(page.locator('[name="phone_number"]'), "7135551234");

  // The state control is the shared SelectMenu ("Select a state…"), not a
  // native select: it opens onto a "Search states..." filter over rows that
  // carry no option role, with Texas below the fold - so filter first, then
  // click the row text.
  const stateTrigger = await onScreen(page, page.getByText(/Select a stat/i));
  await stateTrigger.click({ force: true });
  const stateSearch = page.getByPlaceholder(/Search states/i).first();
  await expect(stateSearch, "the state menu never opened").toBeVisible({ timeout: 10_000 });
  await stateSearch.fill("Texas");
  await page.getByText("Texas", { exact: true }).first().click();

  await (await onScreen(page, page.getByRole("button", { name: /Save New Address/i }))).click({
    force: true,
  });

  // The list shows the new address; the label is unique to this run.
  await expect(page.getByText(label).first(), "the created address never appeared in the list")
    .toBeVisible({ timeout: 20_000 });

  // EDIT: the card carries explicit Edit/Remove buttons - clicking the label
  // text does nothing. Scope to the card holding this run's unique label.
  const card = page
    .locator("div")
    .filter({ has: page.getByText(label) })
    .filter({ has: page.getByRole("button", { name: /^Edit$/ }) })
    .last();
  await card.getByRole("button", { name: /^Edit$/ }).click();
  await ensureManualMode(page);
  await fillEach(page.locator('[name="line_1"]'), "6100 Main St Suite 200");
  await (await onScreen(page, page.getByRole("button", { name: /^Save Address$/i }))).click({
    force: true,
  });

  await expect(
    page.getByText(/6100 Main St Suite 200/).first(),
    "the edited street never appeared in the list"
  ).toBeVisible({ timeout: 20_000 });

  // DELETE, through the card's own Remove button - the API afterEach is the
  // backstop either way, so a missing control fails loudly rather than
  // leaking rows.
  const cardAgain = page
    .locator("div")
    .filter({ has: page.getByText(label) })
    .filter({ has: page.getByRole("button", { name: /^Remove$/ }) })
    .last();
  await cardAgain.getByRole("button", { name: /^Remove$/ }).click();

  await expect(page.getByText(label), "the deleted address is still listed").toHaveCount(0, {
    timeout: 20_000,
  });
});
