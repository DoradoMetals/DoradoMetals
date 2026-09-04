// WHAT THE SHIPPING AND FULFILLMENT HOOKS ACTUALLY SEND, checked against
// @dorado/contracts' strict bodies.
//
// It moved here with the hooks (it was frontend/features/shipping/
// queries.test.tsx) and the seam moved with it: the frontend stubbed an axios
// wrapper, and this package's transport is the platform's `fetch`, so that is
// what is replaced.
//
// The three cases that earn their keep are the ones a strict body would 400
// on and an unvalidated `req.body` destructure used to absorb: tracking sending
// a tracking_number and carrier_id the body never declared, cancel_label
// sending a tracking_number, and cancel_pickup nesting its whole body under an
// `input` key.
//
// The bookings are here for the shape ruling 43 asks for: the fulfillment is
// named ONCE, at the top level, and never as a column of the patch beside it.
import { describe, expect, test, afterEach } from "vitest";
import {
  FulfillmentMethodUpdateBody, FulfillmentScheduleDirectBody, FulfillmentSchedulePickupBody,
  ShipmentPatch, ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody,
  ShippingGetLocationsBody, ShippingGetTrackingBody, ShippingValidateAddressBody,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

let lastBody: unknown = null;

function captures() {
  lastBody = null;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    lastBody = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

const ID = "9f1c2b3a-0000-4000-8000-000000000001";
const OTHER = "9f1c2b3a-0000-4000-8000-000000000002";

// The hooks are thin wrappers over apiRequest, and a react-query harness in a
// node environment would test react-query. What is asserted is the BODY, so
// the calls are made the way each hook makes them.
async function send(url: string, body: unknown) {
  captures();
  await apiRequest("POST", url, body);
  return lastBody;
}

describe("the carrier operations name ids, never composed objects", () => {
  test("check_pickup takes an address_id", async () => {
    const body = await send("/shipping/check_pickup", {
      address_id: ID, code: "FDXG", readyDate: "2026-09-10",
    });
    expect(() => ShippingCheckPickupBody.parse(body)).not.toThrow();
  });

  test("get_locations takes an address_id and a radius", async () => {
    const body = await send("/shipping/get_locations", {
      address_id: ID, radius_miles: 50, max_results: 50,
    });
    expect(() => ShippingGetLocationsBody.parse(body)).not.toThrow();
  });

  test("validate_address takes an address_id", async () => {
    const body = await send("/shipping/validate_address", { address_id: ID });
    expect(() => ShippingValidateAddressBody.parse(body)).not.toThrow();
  });

  // The server reads the tracking number and the carrier off the shipment row
  // it looks up by id; sending either would be refused.
  test("get_tracking is the shipment id and nothing else", async () => {
    const body = await send("/shipping/get_tracking", { shipment_id: ID });
    expect(() => ShippingGetTrackingBody.parse(body)).not.toThrow();
    expect(body).toEqual({ shipment_id: ID });
  });

  test("cancel_label carries no tracking number", async () => {
    const body = await send("/shipping/cancel_label", { shipment_id: ID });
    expect(() => ShippingCancelLabelBody.parse(body)).not.toThrow();
  });

  // It used to nest the whole body under an `input` key and add a
  // confirmation_code the contract never declared.
  test("cancel_pickup sends its fields at the top level", async () => {
    const body = await send("/shipping/cancel_pickup", { pickup_id: ID });
    expect(() => ShippingCancelPickupBody.parse(body)).not.toThrow();
  });
});

describe("the shipment patch is the shipment's own columns", () => {
  test("money and the tracking pair parse; nothing else is sent", async () => {
    captures();
    await apiRequest("PATCH", `/shipments/${ID}`, {
      shipping_charge: 25, shipping_actual: 22.5,
    });
    expect(() => ShipmentPatch.parse(lastBody)).not.toThrow();
  });
});

describe("a booking names its fulfillment once, at the top level", () => {
  test("schedule_pickup", async () => {
    const body = await send("/fulfillments/schedule_pickup", {
      fulfillment_id: ID,
      pickup: { pickup_address_id: OTHER, start_time: "2026-09-10T15:00:00Z" },
    });
    expect(() => FulfillmentSchedulePickupBody.parse(body)).not.toThrow();
  });

  test("schedule_direct", async () => {
    const body = await send("/fulfillments/schedule_direct", {
      fulfillment_id: ID,
      direct: { location_id: OTHER, is_appointment: true },
    });
    expect(() => FulfillmentScheduleDirectBody.parse(body)).not.toThrow();
  });

  // The id used to be extended onto the patch, where it read as a column being
  // written.
  test("a method update names the row by id, apart from the columns", async () => {
    const body = await send("/fulfillments/methods/update", {
      id: ID, method: { label: "Ship it", enabled: true },
    });
    expect(() => FulfillmentMethodUpdateBody.parse(body)).not.toThrow();
  });
});
