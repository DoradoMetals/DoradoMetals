// What comes back from FedEx, reduced.
//
// The test that matters here is the one pinning a THROW. parseTracking
// optionally chains its way to trackResults[0] and then dereferences it
// unguarded, so an empty or error response raises a TypeError instead of
// returning an empty result. That is deliberate, it is load-bearing, and
// without a test saying so the next person to read it removes the asymmetry in
// good faith.
//
// It is load-bearing because of what runs after it.
// features/shipping/operations/service.ts calls this inside a transaction, and
// the next thing it used to do was delete every tracking event for the shipment
// and re-insert whatever came back. The throw happened before that delete, so
// it was the only thing preventing an empty response from wiping a shipment's
// history - production lost seven that way before the service learned to return
// early. Softening this without that guard would have converted a loud,
// harmless 500 into a silent deletion.
//
// The guard exists now, so this COULD be softened safely. It is not, on
// purpose: a FedEx outage or a bad tracking number should be loud, and
// answering "nothing recognised" to "I could not ask" makes an outage look like
// a quiet parcel.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTracking,
  parseRates,
  parseAddressValidation,
  parseCreateShipment,
  parseScheduledPickup,
} from "#providers/shipments/utils/parsing.ts";

// The FedEx envelope, declared only as far as this file fills it in. The real
// `FedexTrackResult` is not exported by parsing.ts, and the honest thing is to
// state the subset the fixtures build rather than cast: if a test starts
// supplying a field the parser does not read, or misspells one it does, that is
// a compile error here instead of a silently-ignored key.
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

// THE DELIBERATE THROW. See the header. If this test ever fails because
// somebody added `?.`, read features/shipping/operations/service.ts first: the
// early return there is what makes softening this survivable, and the reason
// not to is that an outage should not look like a quiet parcel.
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

// Unlike parseTracking, these return a definite answer for an empty response
// rather than throwing - and that is safe only because nothing stores it.
// updateValidation exists on the addresses repo and no service calls it, so a
// validation result reaches the browser and never the database.
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
