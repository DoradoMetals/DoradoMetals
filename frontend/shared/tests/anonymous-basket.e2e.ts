import { test, expect } from "@playwright/test";

// A VISITOR'S BASKET, WITH NOBODY SIGNED IN (ruling 63).
//
// Runs in the `public` project - no storageState, no session - which is the
// whole point: before this lane a signed-out visitor's basket was a zustand
// store in localStorage and this journey never touched the API at all. It is
// server rows now, under an ANONYMOUS better-auth user the first click mints,
// so the assertion is that the API answers a caller who never signed in.
//
// *** NEVER EXECUTED. *** Written in a lane that does not run Playwright (it
// needs a live API and a built frontend). Selectors are copied from the two
// authed checkout specs, which do run; treat a first failure here as a spec
// bug before a product one.
//
// WHAT IT LEAVES BEHIND. One anonymous auth.users row per run, plus its
// session. The basket is cleared through the API afterwards; the user row is
// the visitor sweep's (api domain/checkout/sweep.ts, seven days), which is
// exactly the lifecycle this spec is here to exercise - so it is not cleaned
// up by hand.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/$/, "");

test.afterEach(async ({ page }) => {
  // Through the PAGE, not `request`: the visitor's session is a cookie in the
  // browser context, and a bare request context carries no session at all.
  await page
    .evaluate(
      (api) =>
        fetch(`${api}/checkout/items?direction=sale`, {
          method: "DELETE",
          credentials: "include",
        }).then(() => undefined),
      API
    )
    .catch(() => undefined);
});

test("a signed-out visitor's basket is the server's", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/buy");
  const addButton = page.getByRole("button", { name: /^Add to Checkout$/i }).first();
  await expect(addButton, "no buyable product card rendered on /buy").toBeVisible({
    timeout: 30_000,
  });
  await addButton.click();

  // THE ASSERTION THAT MATTERS: the API - not localStorage - now holds a line
  // for a caller who has never signed in. `signIn.anonymous()` ran inside the
  // click, before the PUT (packages/client/src/session.ts).
  await expect
    .poll(
      async () =>
        await page.evaluate(
          (api) =>
            fetch(`${api}/checkout/items?direction=sale`, { credentials: "include" })
              .then((r) => (r.ok ? r.json() : []))
              .then((rows: unknown[]) => rows.length),
          API
        ),
      {
        message:
          "the visitor's basket never reached the server - either the anonymous " +
          "sign-in did not happen or the basket is still browser-local",
        timeout: 30_000,
      }
    )
    .toBeGreaterThan(0);

  // And the drawer renders those rows, from the same place a customer's come
  // from - there is no second code path left for a signed-out surface.
  await page.getByRole("button", { name: /open checkout/i }).click();
  await expect(
    page.locator("number-flow-react").first(),
    "the visitor's basket rendered no price element"
  ).toBeVisible({ timeout: 20_000 });
});

// THE TWO WALLS - the payout step and the placement - are NOT driven here.
// Both are refusals the API makes about the account, and both are pinned over
// real HTTP in api/domain/checkout/tests/anonymous-checkout.test.ts, inside a
// transaction that rolls back. Reproducing them through the browser would mean
// a visitor entering an address and bank details against dev, for an assertion
// that is already made somewhere cheaper and stricter.
