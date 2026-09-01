import { test, expect, type Page } from "@playwright/test";

// CREATING resources from the admin side - the half of admin the read specs
// and the drawer-work spec do not touch. Cross-feature (leads, carriers,
// products, users share one CreateDialog), so it lives in shared/tests.
//
// TWO TIERS, BY WHETHER A DELETE EXISTS:
//   - Leads and carriers have real DELETE endpoints, so they get the full
//     create -> appears -> cleaned cycle, e2e- prefixed with an API afterEach.
//   - Products and users have NO delete path (create_product/save_product
//     only; users are auth accounts), so a submitted create would accumulate
//     forever in dev AND in the catalogue the customer pages read. Those two
//     get the dialog-opens-with-its-fields assertion and nothing more, and
//     the missing delete is the finding, not a gap in this spec.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PREFIX = "e2e-create-";

test.afterEach(async ({ request }) => {
  try {
    const leads = await request.get(`${API}/leads/get_all`);
    if (leads.ok()) {
      for (const lead of await leads.json()) {
        if (lead?.name?.startsWith(PREFIX)) {
          await request.delete(`${API}/leads/delete`, { data: { lead_id: lead.id } });
        }
      }
    }
    const carriers = await request.get(`${API}/carriers/get`);
    if (carriers.ok()) {
      for (const carrier of await carriers.json()) {
        const name = carrier?.organization?.name ?? carrier?.name;
        if (name?.startsWith(PREFIX)) {
          await request.delete(`${API}/carriers/delete`, { data: { carrier_id: carrier.id } });
        }
      }
    }
  } catch {
    // Best effort; the prefix keeps any survivor identifiable.
  }
});

async function openCreateDialog(page: Page, tab: string) {
  await page.goto(`/admin?tab=${tab}`);
  const trigger = page.getByRole("button", { name: /^Create/i }).first();
  await expect(trigger, `the ${tab} section offers no create button`).toBeVisible({
    timeout: 30_000,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog").filter({ hasText: /Create New/i }).first();
  await expect(dialog, `the ${tab} create dialog never opened`).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test("a lead is created from the admin table, and lands in it", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `${PREFIX}lead-${Date.now()}`;

  const dialog = await openCreateDialog(page, "leads");
  await dialog.getByLabel(/^Name$/i).fill(name);
  await dialog.getByLabel(/Phone/i).fill("7135551234").catch(() => {});
  await dialog.getByLabel(/Email/i).fill(`${name}@example.invalid`).catch(() => {});
  await dialog.getByRole("button", { name: /^Create Lead$/i }).click();

  await expect(page.getByText(name).first(), "the created lead never appeared in the table")
    .toBeVisible({ timeout: 20_000 });
});

test("a carrier is created from the admin table, and lands in it", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `${PREFIX}carrier-${Date.now()}`;

  const dialog = await openCreateDialog(page, "carriers");
  await dialog.getByLabel(/^Name$/i).fill(name);
  await dialog.getByRole("button", { name: /^Create Carrier$/i }).click();

  await expect(page.getByText(name).first(), "the created carrier never appeared in the table")
    .toBeVisible({ timeout: 20_000 });
});

test("the product create dialog opens with its fields, and is not submitted", async ({ page }) => {
  // NOT SUBMITTED: there is no product delete endpoint, and a created product
  // joins the same exchange.products the customer catalogue and the quotes
  // pipeline read. When a delete (or a blessed e2e cleanup) exists, this
  // becomes a full cycle like the lead's.
  const dialog = await openCreateDialog(page, "bullion");
  await expect(dialog.getByText(/Create New Product/i).first()).toBeVisible();
  const inputs = dialog.locator("input");
  expect(await inputs.count(), "the product dialog has no fields").toBeGreaterThan(0);
  await page.keyboard.press("Escape");
});

test("the user create dialog opens with its fields, and is not submitted", async ({ page }) => {
  // NOT SUBMITTED: an admin-created user is a real auth account with no
  // delete path from here.
  const dialog = await openCreateDialog(page, "users");
  await expect(dialog.getByText(/Create New User/i).first()).toBeVisible();
  const inputs = dialog.locator("input");
  expect(await inputs.count(), "the user dialog has no fields").toBeGreaterThan(0);
  await page.keyboard.press("Escape");
});
