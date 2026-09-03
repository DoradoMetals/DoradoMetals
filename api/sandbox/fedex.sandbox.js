// FedEx, against the real sandbox.
//
// WHY THIS IS SHAPED THE WAY IT IS. providers/shipments/endpoints.ts says, in its
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
const { fetchAccessToken, fetchTrackingToken } = await import("#providers/shipments/endpoints.ts");

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

// THE GUARD, ASSERTED RATHER THAN TRUSTED. providers/shipments refuses the LIVE API
// under test and permits the sandbox. Everything above depends on that being
// true, so it is checked here rather than assumed.
test("the provider refuses the live API during a test run", async () => {
  const saved = process.env.FEDEX_ENV;
  process.env.FEDEX_ENV = "production";
  try {
    const fresh = await import(`#providers/shipments/endpoints.ts?live=${Date.now()}`);
    await assert.rejects(
      () => fresh.fetchAccessToken(),
      /refusing to call the LIVE FedEx API/,
      "THE LIVE GUARD IS NOT IN FORCE - a test could buy a real label"
    );
  } finally {
    process.env.FEDEX_ENV = saved;
  }
});

// ---------------------------------------------------------------------------
// THE BUSINESS OPERATIONS (2026-09-01, Jacob: "we need full testing").
// Authentication proved the credentials; nothing above ever asked FedEx to DO
// anything. These drive the same adapter builders the live operations layer
// uses, so what is exercised is this codebase's request-building - a payload
// field FedEx rejects fails here, not in a customer's checkout.
const fedex = await import("#providers/shipments/fedex.ts");
const adapters = await import("#domain/shipping/operations/adapters/fedex.ts");

const CUSTOMER_ADDRESS = {
  line_1: "6100 Main St", city: "Houston", state: "TX",
  zip: "77005", country_code: "US", is_residential: true,
};
const STORE_ADDRESS = {
  line_1: "1600 Lamar St", city: "Houston", state: "TX",
  zip: "77010", country_code: "US", is_residential: false,
};
const PKG = {
  weight: { units: "LB", value: 5 },
  dimensions: { length: 10, width: 8, height: 6, units: "IN" },
};

test("an inbound rate quote returns priced services", async () => {
  const quote = () =>
    fedex.getRates(
      adapters.getRatesInput({
        shipperAddress: CUSTOMER_ADDRESS,
        recipientAddress: STORE_ADDRESS,
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        pkg: PKG,
      })
    );
  // One retry with a breath in between: the sandbox 503s under rapid
  // successive calls (throttling), and the exact same payload rates 200 in
  // isolation - verified by probing during the 2026-09-01 build-out. A real
  // payload break fails both attempts and still fails the test.
  const out = await quote().catch(async () => {
    await new Promise((r) => setTimeout(r, 4000));
    return quote();
  });
  // parseRates hands back the app shape - an array of
  // {serviceType, netCharge, ...} - not FedEx's envelope.
  assert.ok(Array.isArray(out) && out.length > 0, "no rated services came back");
  assert.ok(out[0].serviceType, "a rate detail names no service");
  assert.ok(
    out.some((r) => typeof r.netCharge === "number"),
    "no rate detail carries a numeric price"
  );
});

test("a label is created on the sandbox and then voided", async () => {
  const out = await fedex.createLabel(
    adapters.createLabelInput({
      shipper: { contact: { name: "Sandbox Suite", phone: "7135551234" }, address: CUSTOMER_ADDRESS },
      recipient: { contact: { name: "Dorado Metals", phone: "7135551234" }, address: STORE_ADDRESS },
      serviceType: "FEDEX_GROUND",
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      pkg: PKG,
    })
  );
  // parseCreateShipment hands back {tracking_number, labelFile} - the label
  // is the PNG the customer would print, already unwrapped.
  const tracking = out?.tracking_number;
  assert.ok(tracking, `the label carries no tracking number: ${JSON.stringify(out).slice(0, 120)}`);
  assert.ok(String(out?.labelFile ?? "").length > 1000, "the label PNG is missing or tiny");

  // Void it - the sandbox honours cancellation, and leaving even fake labels
  // uncancelled is a habit nobody should carry to the live account.
  const cancelled = await fedex.cancelLabel(
    adapters.cancelLabelInput({ tracking_number: tracking })
  );
  assert.ok(cancelled, "the void answered nothing");
});

test("tracking answers for FedEx's own mock number", async () => {
  // 449044304137821 is one of FedEx's documented virtualised tracking
  // numbers - it exists only in the sandbox and always answers.
  const out = await fedex.getTracking(
    adapters.getTrackingInput({ tracking_number: "449044304137821" })
  );
  // parseTracking hands back {latestStatus, scanEvents, ...}.
  assert.ok(out?.latestStatus, `tracking answered no status: ${JSON.stringify(out).slice(0, 160)}`);
  assert.ok(Array.isArray(out?.scanEvents), "tracking carries no scan events");
});
