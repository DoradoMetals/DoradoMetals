// What comes back from FedEx, reduced. The test that matters pins a deliberate THROW: parseTracking dereferences trackResults[0] unguarded, so an empty or error response raises a TypeError instead of an empty result.
// Load-bearing because of what runs after it: the caller used to delete every tracking event for a shipment and re-insert whatever came back — the throw, landing before that delete, was the only thing stopping an empty response from wiping history (production lost seven shipments' histories this way before the service learned to return early).
// The service now has its own guard, so this COULD be softened safely. Deliberately not: a FedEx outage or bad tracking number should be loud, not look like a quiet parcel.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseTracking,
  parseRates,
  parseAddressValidation,
  parseCreateShipment,
  parseScheduledPickup,
} from "#providers/shipments/utils/parsing.ts";

// Declares only the subset the fixtures build, rather than casting the real (unexported) FedexTrackResult — a misspelled or unread field becomes a compile error here instead of a silently-ignored key.
type TrackResultFixture = {
  estimatedDeliveryTimeWindow?: { window?: { ends?: string } };
  scanEvents?: {
    eventType?: string;
    date?: string;
    scanLocation?: { city?: string; stateOrProvinceCode?: string };
  }[];
};

const trackingResponse = (trackResults: TrackResultFixture[]) => ({
  output: { completeTrackResults: [{ trackResults }] },
});

test("a tracking response is reduced to events, newest last", () => {
  const parsed = parseTracking(
    trackingResponse([
      {
        estimatedDeliveryTimeWindow: { window: { ends: "2026-09-01T12:00:00" } },
        scanEvents: [
          { eventType: "HP", date: "2026-08-22T10:00:00", scanLocation: { city: "dallas", stateOrProvinceCode: "TX" } },
          { eventType: "IT", date: "2026-08-21T10:00:00", scanLocation: { city: "memphis", stateOrProvinceCode: "TN" } },
        ],
      },
    ])
  );

  assert.equal(parsed.estimatedDeliveryTime, "2026-09-01T12:00:00");
  // FedEx returns newest first and this reverses, so the latest status is last.
  assert.deepEqual(
    parsed.scanEvents.map((e) => e.status),
    ["In Transit", "Delivered"]
  );
  assert.equal(parsed.latestStatus, "Delivered");
  assert.equal(parsed.deliveredAt, "2026-08-22T10:00:00");
  assert.equal(parsed.scanEvents[0].location, "Memphis, TN", "the city was not title-cased");
});

// An event type the map does not name is dropped, which is what makes the
// "recognised nothing" case reachable at all.
test("events of unrecognised types are dropped", () => {
  const parsed = parseTracking(
    trackingResponse([{ scanEvents: [{ eventType: "ZZ", date: "2026-08-22T10:00:00" }] }])
  );

  assert.deepEqual(parsed.scanEvents, []);
  assert.equal(parsed.latestStatus, "Status Unknown");
  assert.equal(parsed.estimatedDeliveryTime, "TBD");
  assert.equal(parsed.deliveredAt, null);
});

// The deliberate throw (see header) — if this ever fails because someone added `?.`, check the caller's early-return guard first; an outage should not look like a quiet parcel.
test("an empty or error response throws rather than reporting nothing", () => {
  assert.throws(() => parseTracking({}), TypeError);
  assert.throws(() => parseTracking({ output: {} }), TypeError);
  assert.throws(() => parseTracking({ output: { completeTrackResults: [] } }), TypeError);
});

test("rates take the ACCOUNT rate and default the currency", () => {
  const parsed = parseRates({
    output: {
      rateReplyDetails: [
        {
          serviceType: "FEDEX_GROUND",
          ratedShipmentDetails: [
            { rateType: "LIST", totalNetCharge: 99 },
            { rateType: "ACCOUNT", totalNetCharge: 42 },
          ],
        },
      ],
    },
  });

  assert.equal(parsed[0].netCharge, 42, "the list rate was taken instead of the account rate");
  assert.equal(parsed[0].currency, "USD");
  assert.equal(parsed[0].serviceDescription, null);
});

// Unlike parseTracking, these return a definite answer for an empty response rather than throwing — safe only because nothing stores the result (validation reaches the browser, never the database).
test("an empty address validation is invalid and residential, and is not stored", () => {
  assert.deepEqual(parseAddressValidation({}), {
    is_valid: false,
    is_residential: true,
  });
});

test("a shipment with no label yields nulls rather than throwing", () => {
  assert.deepEqual(parseCreateShipment({}), {
    tracking_number: null,
    labelFile: null,
  });
  assert.deepEqual(parseScheduledPickup({}), {
    confirmationNumber: null,
    location: null,
  });
});
