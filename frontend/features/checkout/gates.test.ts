import { describe, expect, test } from "vitest";
import type { CarrierHandoff, FulfillmentMethodRead } from "@dorado/contracts";

import { readyForPayment, readyForRates, readyToPlace, resolveHandoff } from "@/features/checkout/gates";

describe("readyForRates", () => {
  test("blocked while items is missing", () => {
    expect(readyForRates(["items", "shipper_address", "package"])).toBe(false);
  });

  test("blocked while the address step is missing, purchase-shaped", () => {
    expect(readyForRates(["shipper_address", "package"])).toBe(false);
  });

  test("blocked while the address step is missing, sale-shaped", () => {
    expect(readyForRates(["recipient_address"])).toBe(false);
  });

  test("blocked while package is missing", () => {
    expect(readyForRates(["package"])).toBe(false);
  });

  test("ready once items, the address and package are all landed", () => {
    expect(readyForRates(["carrier_service", "payout_account"])).toBe(true);
  });

  test("ready on an empty list", () => {
    expect(readyForRates([])).toBe(true);
  });
});

describe("readyForPayment", () => {
  test("blocked while anything but the money step remains", () => {
    expect(readyForPayment(["carrier_service", "payout_account"])).toBe(false);
  });

  test("ready holding only the purchase money step", () => {
    expect(readyForPayment(["payout_account"])).toBe(true);
  });

  test("ready holding only the sale money step", () => {
    expect(readyForPayment(["payment_method"])).toBe(true);
  });

  test("ready on an empty list", () => {
    expect(readyForPayment([])).toBe(true);
  });
});

describe("readyToPlace", () => {
  test("blocked while anything remains", () => {
    expect(readyToPlace(["payout_account"])).toBe(false);
  });

  test("ready on an empty list", () => {
    expect(readyToPlace([])).toBe(true);
  });
});

describe("resolveHandoff", () => {
  const dropoff: CarrierHandoff = {
    code: "DROP",
    name: "Drop off",
    requires_schedule: false,
    has_dropoff_locations: true,
    display_order: 0,
  };
  const collect: CarrierHandoff = {
    code: "COLLECT",
    name: "Courier pickup",
    requires_schedule: true,
    has_dropoff_locations: false,
    display_order: 1,
  };
  const handoffs = [dropoff, collect];

  const method = (over: Partial<FulfillmentMethodRead> = {}): FulfillmentMethodRead => ({
    id: "m-1",
    type: "CARRIER DROPOFF",
    label: "Drop off",
    admin_label: null,
    category: "SHIPMENT",
    direction: "purchase",
    enabled: true,
    hidden: false,
    is_default: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  test("a dropoff method resolves to the non-schedule handoff", () => {
    expect(resolveHandoff([method()], handoffs, "m-1")).toEqual(dropoff);
  });

  test("a pickup method resolves to the schedule handoff", () => {
    expect(resolveHandoff([method({ id: "m-2", type: "CARRIER PICKUP" })], handoffs, "m-2")).toEqual(
      collect
    );
  });

  test("nothing chosen when fulfillment_method_id is null", () => {
    expect(resolveHandoff([method()], handoffs, null)).toBeNull();
  });

  test("nothing chosen when the id matches no method", () => {
    expect(resolveHandoff([method()], handoffs, "missing")).toBeNull();
  });
});
