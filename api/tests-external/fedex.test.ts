// FedEx, LIVE, against the real sandbox - no cassette, no nock, no
// no-network guard. This directory is excluded from every guarded lane (see
// `./lane.ts`); this file's name matches `*.test.ts`, so
// `pnpm --filter @dorado/api test:external` picks it up on purpose. The
// `test:external` script sets `FEDEX_ENV=sandbox` itself, so this file does
// not have to.
//
// WHY THIS EXISTS. Lane 5's cassettes (tests/cassettes/fedex/, replayed by
// providers/shipments/tests/fedex-cassettes.test.ts) prove OUR half of every
// call: the payload `providers/shipments/payloads.ts` builds, and the mapping
// `providers/shipments/utils/parsing.ts` makes of the answer. They prove
// nothing about FedEx ITSELF - a recorded response is what the sandbox said
// on the day it was recorded. This lane is the other half: the same
// scenarios, live, so a shape drift in FedEx's own API is caught here.
//
// NOT IN ANY GATE. Slow, needs network, the sandbox throttles under rapid
// calls, and a failure here can mean FedEx had a bad morning rather than that
// this codebase is wrong - the same reasoning that already keeps
// sandbox/fedex.sandbox.js (a separate, longer-running smoke test, run by
// `pnpm test:sandbox`) out of every gate. Run this file by hand:
//
//   pnpm --filter @dorado/api test:external
//
// documented as nightly.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import "#env";
import {
  accountNumber,
  activeEnvironment,
  apiBase,
} from "#providers/shipments/endpoints.ts";

before(() => {
  for (const name of [
    "FEDEX_SANDBOX_CLIENT_ID",
    "FEDEX_SANDBOX_CLIENT_SECRET",
    "FEDEX_SANDBOX_ACCOUNT_NUMBER",
    "FEDEX_SANDBOX_API_URL",
  ]) {
    assert.ok(process.env[name], `${name} is not set - test:external cannot run`);
  }
});

// THE FEDEX EQUIVALENT OF THE sk_live REFUSAL. FedEx credentials carry no
// prefix that marks them "test" the way Stripe's do, so "live-shaped" is
// judged the only way it can be here: the switch this codebase actually
// branches on (FEDEX_ENV) must read "sandbox", and the sandbox credential set
// must be a genuinely DIFFERENT account from the production one - if they
// were ever equal, "sandbox" and "production" would be the same account and
// nothing below would be safe to run.
test("refuses to run against a live-shaped FedEx configuration", () => {
  assert.equal(
    process.env.FEDEX_ENV, "sandbox",
    "FEDEX_ENV is not \"sandbox\" - refusing to run test:external's FedEx " +
      "scenarios against production."
  );
  assert.equal(activeEnvironment(), "sandbox");
  assert.equal(apiBase(), process.env.FEDEX_SANDBOX_API_URL);
  assert.equal(accountNumber(), process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER);
  assert.notEqual(
    process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER,
    process.env.FEDEX_ACCOUNT_NUMBER,
    "the sandbox and production account numbers are identical - this " +
      "environment cannot tell them apart, so refusing to run live scenarios."
  );
});

// ---------------------------------------------------------------------------
// THE OPERATIONS. providers/shipments/endpoints.ts's own refuseInTests()
// still guards the LIVE API underneath every call below (isTestRun() is true
// under NODE_ENV=test, live included) - FEDEX_ENV=sandbox, set by the
// test:external script, is what lets these through to the sandbox rather than
// being refused outright.
// ---------------------------------------------------------------------------
const fedex = await import("#providers/shipments/fedex.ts");
const adapters = await import("#domain/shipping/operations/adapters/fedex.ts");

// Synthetic and public - a university and a convention centre - so no run of
// this file can ever send FedEx a customer's address. Same two
// providers/shipments/tests/fedex-cassettes.test.ts uses, so the cassette and
// the live lane exercise the identical request.
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

// FedEx's own documented virtualised tracking number - exists only in the
// sandbox and always answers.
const SANDBOX_TRACKING_NUMBER = "449044304137821";

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  // The sandbox 503s under rapid successive calls (throttling) - the exact
  // same payload rates 200 in isolation, verified during the 2026-09-01
  // build-out (sandbox/fedex.sandbox.js carries the same pattern). One retry
  // with a breath in between; a real payload break fails both attempts.
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 4000));
    return fn();
  }
}

test("a rate quote returns priced services", async () => {
  const rates = await withOneRetry(() =>
    fedex.getRates(
      adapters.getRatesInput({
        shipperAddress: CUSTOMER_ADDRESS,
        recipientAddress: STORE_ADDRESS,
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        pkg: PKG,
      })
    )
  );
  assert.ok(Array.isArray(rates) && rates.length > 0, "no rated services came back");
  assert.ok(rates[0].serviceType, "a rate detail names no service");
  assert.ok(
    rates.some((r) => typeof r.netCharge === "number"),
    "no rate detail carries a numeric price"
  );
});

test("a real street address validates", async () => {
  const result = await withOneRetry(() => fedex.validateAddress(CUSTOMER_ADDRESS));
  assert.equal(result.is_valid, true, "a real street address did not validate");
  assert.equal(
    typeof result.is_residential, "boolean",
    "the residential classification is what the shipping quote branches on"
  );
});

test("pickup availability returns dates with times inside them", async () => {
  const options = await withOneRetry(() =>
    fedex.checkPickup(
      adapters.checkPickupInput({
        pickupAddress: CUSTOMER_ADDRESS, code: "FDXE", readyDate: new Date(),
      })
    )
  );
  assert.ok(Array.isArray(options) && options.length > 0, "no pickup days came back");
  for (const day of options) {
    assert.match(String(day.pickupDate), /^\d{4}-\d{2}-\d{2}$/, "a pickup day is not a date");
    assert.ok(day.times.length > 0, "a day survived the filter with no times in it");
  }
});

test("tracking answers for FedEx's own mock number", async () => {
  const tracking = await withOneRetry(() =>
    fedex.getTracking(adapters.getTrackingInput({ tracking_number: SANDBOX_TRACKING_NUMBER }))
  );
  assert.ok(tracking.latestStatus, "tracking answered no status");
  assert.ok(Array.isArray(tracking.scanEvents), "tracking carries no scan events");
});

// LABEL PURCHASE + VOID. Only runs if the sandbox credentials are present
// (checked in before()) AND this account's sandbox is known to issue TEST
// labels rather than something production-shaped - established already by
// sandbox/fedex.sandbox.js's own "created on the sandbox and then voided"
// test and by this lane's own cassette recording
// (tests/cassettes/fedex/create-and-void-label.json, recorded 2026-09-03
// against apis-sandbox.fedex.com, same account). The label is voided in the
// SAME run via cancelLabel - never left behind, per CLAUDE.md's standing rule
// against an orphaned label for an order that does not exist.
test("a label is created on the sandbox and voided in the same run", async () => {
  const created = await withOneRetry(() =>
    fedex.createLabel(
      adapters.createLabelInput({
        shipper: {
          contact: { name: "External Suite", phone: "7135551234" },
          address: CUSTOMER_ADDRESS,
        },
        recipient: {
          contact: { name: "Dorado Metals", phone: "7135551234" },
          address: STORE_ADDRESS,
        },
        serviceType: "FEDEX_GROUND",
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        pkg: PKG,
      })
    )
  );

  assert.ok(created.tracking_number, "the label carries no tracking number");
  assert.ok(String(created.labelFile ?? "").length > 1000, "the label PNG is missing or tiny");

  const voided = await fedex.cancelLabel(
    adapters.cancelLabelInput({ tracking_number: created.tracking_number })
  );
  assert.deepEqual(voided, { cancelled: true }, "the void did not confirm");
});
