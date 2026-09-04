// THE FEDEX OPERATIONS, AGAINST RECORDED SANDBOX RESPONSES.
//
// Four of these had no test of any kind (docs/waves/test-suite-redesign.md
// 1.4: "rate quote - no test at all", "address validation - no test at all",
// and `createLabel`/`cancelLabel` unreachable behind `refuseInTests`). They
// were untestable rather than untested: the guard throws on every outbound
// call, so the only way to exercise them was to let a suite buy real labels.
//
// A cassette answers instead. What that proves is OUR half and only our half:
// the payload `providers/shipments/payloads.ts` builds through the adapter, and
// the mapping `providers/shipments/utils/parsing.ts` makes of the answer. The
// cassettes were recorded against the real FedEx sandbox
// (apis-sandbox.fedex.com) - see tests/cassettes/README.md - and
// `tests-external/fedex.test.ts` runs the same scenarios live so a drift in
// FedEx's own shapes is still caught somewhere.
//
// *** FEDEX_ENV IS SET AND RESTORED PER FILE. *** `refuseInTests` refuses the
// LIVE API during a test run and permits the sandbox, and these cassettes were
// recorded from the sandbox host, so the guard has to be on its sandbox
// setting for the base URL to match what was recorded. Restoring it in
// `afterAll` matters because vitest reuses a worker PROCESS across files:
// leaving it set would silently disarm the live-API refusal for whichever file
// ran next in the same worker.
//
// *** NOTHING REACHES THE NETWORK. *** `shared/testing/no-network.ts` is armed
// underneath, and the cassette harness re-arms it around every scenario. A
// request with no cassette gets nock's refusal, not a socket.
import { test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as fedex from "#providers/shipments/fedex.ts";
import * as adapters from "#providers/shipments/adapters/fedex.ts";

// Synthetic and public - a university and a convention centre, chosen so that
// no cassette can ever hold a customer's address. Same two the sandbox smoke
// test uses, so the two lanes send FedEx the same request.
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

// FedEx's own documented virtualised tracking number. It exists only in the
// sandbox and always answers.
const SANDBOX_TRACKING_NUMBER = "449044304137821";

// PINNED, AND DELIBERATELY IN THE PAST. The pickup request carries a TIME, not
// a date - FedEx answers with the next three business days from whenever it is
// asked - and `parsePickupAvailability` then drops every slot earlier than
// `readyDate`. A readyDate of "now" would therefore filter out every slot in a
// cassette recorded on an earlier day, so the whole recorded answer would
// vanish as the file aged. A fixed date before the recording keeps every
// recorded option in scope forever.
const READY_DATE = new Date("2026-01-01T09:00:00Z");

let previousEnv: string | undefined;

beforeAll(() => {
  previousEnv = process.env.FEDEX_ENV;
  process.env.FEDEX_ENV = "sandbox";
});

afterAll(() => {
  if (previousEnv === undefined) delete process.env.FEDEX_ENV;
  else process.env.FEDEX_ENV = previousEnv;
});

test("a rate quote comes back as priced services", async () => {
  const rates = await withCassette("fedex/rate-quote.json", () =>
    fedex.getRates(
      adapters.getRatesInput({
        shipperAddress: CUSTOMER_ADDRESS,
        recipientAddress: STORE_ADDRESS,
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        pkg: PKG,
      })
    )
  );

  assert.ok(Array.isArray(rates), "getRates did not return a list");
  assert.ok(rates.length > 0, "no rated services came back");
  for (const rate of rates) {
    assert.ok(rate.serviceType, "a rate detail names no service");
    assert.equal(typeof rate.currency, "string");
  }
  assert.ok(
    rates.some((r) => typeof r.netCharge === "number"),
    "no rate detail carries a numeric price - parseRates found no ACCOUNT rate"
  );
});

test("an address the carrier recognises validates", async () => {
  const result = await withCassette("fedex/address-validation.json", () =>
    fedex.validateAddress(CUSTOMER_ADDRESS)
  );

  assert.equal(result.is_valid, true, "a real street address did not validate");
  assert.equal(
    typeof result.is_residential,
    "boolean",
    "the residential classification is what the shipping quote branches on"
  );
});

test("pickup availability comes back as dates with times inside them", async () => {
  const options = await withCassette("fedex/pickup-availability.json", () =>
    fedex.checkPickup(
      adapters.checkPickupInput({
        pickupAddress: CUSTOMER_ADDRESS, code: "FDXE", readyDate: READY_DATE,
      })
    )
  );

  assert.ok(Array.isArray(options), "checkPickup did not return a list");
  assert.ok(options.length > 0, "no pickup days came back");
  for (const day of options) {
    assert.match(String(day.pickupDate), /^\d{4}-\d{2}-\d{2}$/, "a pickup day is not a date");
    assert.ok(day.times.length > 0, "a day survived the filter with no times in it");
  }
});

test("tracking answers with scan events and a latest status", async () => {
  const tracking = await withCassette("fedex/tracking.json", () =>
    fedex.getTracking(adapters.getTrackingInput({ tracking_number: SANDBOX_TRACKING_NUMBER }))
  );

  assert.ok(tracking.latestStatus, "tracking answered no status");
  assert.notEqual(
    tracking.latestStatus,
    "Status Unknown",
    "parseTracking recognised nothing - the status map no longer covers this response"
  );
  assert.ok(Array.isArray(tracking.scanEvents), "tracking carries no scan events");
  assert.ok(tracking.scanEvents.length > 0, "the recorded parcel has no recognised scans");
  for (const event of tracking.scanEvents) {
    assert.equal(typeof event.status, "string");
    assert.notEqual(event.status, "Unknown", "a scan event mapped to nothing");
  }
});

// THE ONE THE PURCHASE PATH RUNS ON, and the reason `seed-e2e-order.mjs`
// exists: `placeOrder` always buys a label, so no test could ever reach this.
// Recorded as a pair - the label FedEx issued and the void that gave it back -
// because a recording that bought without voiding would have left a live
// sandbox label behind.
test("a label is created and then voided", async () => {
  const { label, voided } = await withCassette("fedex/create-and-void-label.json", async () => {
    const created = await fedex.createLabel(
      adapters.createLabelInput({
        shipper: {
          contact: { name: "Cassette Suite", phone: "7135551234" },
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
    );
    const cancelled = await fedex.cancelLabel(
      adapters.cancelLabelInput({ tracking_number: created.tracking_number })
    );
    return { label: created, voided: cancelled };
  });

  assert.ok(label.tracking_number, "the label carries no tracking number");
  assert.match(String(label.tracking_number), /^\d{12,}$/, "that is not a tracking number");
  // The label document itself is replaced by a placeholder when the cassette
  // is written (tests/cassettes/README.md) - a quarter-megabyte of base64 with
  // two addresses rendered into it, that no assertion reads. What must hold is
  // that parseCreateShipment FOUND one: a null here is the shape
  // `labelBufferOrVoid` exists to catch.
  assert.ok(label.labelFile, "parseCreateShipment found no label document");
  assert.ok(Buffer.from(label.labelFile, "base64").length > 0, "the label decodes to nothing");
  assert.deepEqual(voided, { cancelled: true }, "the void did not confirm");
});
