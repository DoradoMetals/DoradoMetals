// FedEx, against the real sandbox.
//
// WHY THIS IS SHAPED THE WAY IT IS. providers/fedex/endpoints.js says, in its
// own header, that the sandbox "is not a test dependency: FedEx's sandbox is not
// reliable enough to sit inside a suite that is supposed to fail only when this
// codebase is wrong". That judgement is correct and this file does not overturn
// it - which is precisely why these live in sandbox/ under their own script,
// outside `pnpm test` and outside `pnpm check`. A failure here means FedEx had a
// bad morning OR we broke something, and telling those apart needs a human.
//
// What it is worth having anyway: the credentials and the URL selection have
// never been exercised at all. `.env` carried a full set of sandbox credentials
// since before the migration started and NOTHING READ THEM - every request went
// to the live API with the live client id. So the cheapest, most valuable thing
// to assert is the thing that was silently wrong for months: that FEDEX_ENV
// actually selects the sandbox, and that the sandbox credentials authenticate.
//
// DELIBERATELY DOES NOT BUY A LABEL. Creating a shipment even in the sandbox
// produces a tracking number and an account charge in some FedEx test accounts,
// and the failure mode of getting that wrong is the one CLAUDE.md calls out:
// an orphaned label for an order that does not exist. Authentication and
// tracking are read-only and prove the wiring; label creation is a human smoke
// test, as the provider's header says.
//
//   FEDEX_ENV=sandbox pnpm --filter @dorado/api test:sandbox
import test, { before } from "node:test";
import assert from "node:assert/strict";
// Loads api/.env. The Stripe suite gets this transitively through its client;
// this one imports the provider directly, so it has to ask.
import "#env";

// Set BEFORE importing the provider, which reads the environment at module load.
process.env.FEDEX_ENV = "sandbox";
const { fetchAccessToken, fetchTrackingToken } = await import("#providers/fedex/endpoints.ts");

before(() => {
  for (const name of [
    "FEDEX_SANDBOX_CLIENT_ID",
    "FEDEX_SANDBOX_CLIENT_SECRET",
    "FEDEX_SANDBOX_ACCOUNT_NUMBER",
    "FEDEX_SANDBOX_API_URL",
  ]) {
    // Presence only. Never print the value.
    assert.ok(process.env[name], `${name} is not set - the sandbox suite cannot run`);
  }
  assert.equal(process.env.FEDEX_ENV, "sandbox", "FEDEX_ENV was not set to sandbox");
});

// THE ASSERTION THIS FILE EXISTS FOR. These credentials sat in .env unread for
// months. This is the first thing that has ever proved they work.
test("the sandbox credentials authenticate", async () => {
  const token = await fetchAccessToken();
  assert.ok(typeof token === "string" && token.length > 20, "no usable access token came back");
});

// The tracking account is a SEPARATE credential set - FEDEX_TRACKING_* and its
// sandbox twin - because FedEx issues tracking access separately from shipping.
// Getting one working proves nothing about the other, which is why both are here.
test("the tracking credentials authenticate separately", async () => {
  const token = await fetchTrackingToken();
  assert.ok(typeof token === "string" && token.length > 20, "no usable tracking token came back");
});

// The two tokens must not be the same string. If they were, one credential set
// is being used for both and the separation above is imaginary - which is the
// exact class of bug that had every request going to the live API.
test("shipping and tracking get different tokens", async () => {
  const [ship, track] = await Promise.all([fetchAccessToken(), fetchTrackingToken()]);
  assert.notEqual(ship, track, "the same token served both - one credential set is unused");
});

// THE GUARD, ASSERTED RATHER THAN TRUSTED. providers/fedex refuses the LIVE API
// under test and permits the sandbox. Everything above depends on that being
// true, so it is checked here rather than assumed.
test("the provider refuses the live API during a test run", async () => {
  const saved = process.env.FEDEX_ENV;
  process.env.FEDEX_ENV = "production";
  try {
    const fresh = await import(`#providers/fedex/endpoints.ts?live=${Date.now()}`);
    await assert.rejects(
      () => fresh.fetchAccessToken(),
      /refusing to call the LIVE FedEx API/,
      "THE LIVE GUARD IS NOT IN FORCE - a test could buy a real label"
    );
  } finally {
    process.env.FEDEX_ENV = saved;
  }
});
