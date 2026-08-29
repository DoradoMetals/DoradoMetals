// The field names the carrier-services admin screen reads off the API.
//
// Three of them are aliases on the API side and nothing about them is obvious.
// The new schema renamed the columns, and the migrated read renames them back:
//
//   shipping.services            wire (exchange.carrier_services)
//   -----------------            --------------------------------
//   supports_pickups             supports_pickup
//   supports_dropoffs            supports_dropoff
//   max_weight_lb                max_weight_lbs
//
// The plurals really do differ - `supports_pickups` on one side and
// `supports_pickup` on the other - which makes the alias look like a typo
// somebody should tidy up. It is not. Removing it changes the wire shape, and
// this drawer would render an undefined toggle as off, silently, for every
// service. A carrier service that supports pickup would start claiming it does
// not.
//
// api/scripts/validate-wire.mjs parses both implementations against the wire
// contract and fails if either stops producing these names. This file is the
// same statement from the consuming side, so the coupling is findable from
// whichever end someone is standing at.
//
// It does not call the API. It pins what this feature reads, so that renaming a
// field here fails a test rather than a customer's screen.
import { describe, expect, test } from "vitest";
import type { CarrierService } from "@/features/carriers/types";

// Every field the drawer and the admin table bind to. Written out rather than
// derived, because deriving it from the type is what the type already does -
// the value here is that changing the interface does not silently change this.
const FIELDS_THE_UI_READS = [
  "id",
  "carrier_id",
  "name",
  "description",
  "code",
  "provider_code",
  "min_transit_days",
  "max_transit_days",
  "supports_pickup",
  "supports_dropoff",
  "supports_returns",
  "max_weight_lbs",
  "max_length_in",
  "max_width_in",
  "max_height_in",
  "supports_insurance",
  "max_declared_value",
  "is_international",
  "is_residential",
  "is_active",
  "display_order",
] as const;

// A response shaped the way the API returns one. Typed as CarrierService so
// that renaming a field in types.ts stops this compiling.
const aService = (): CarrierService => ({
  id: "9f1c2b3a-0000-4000-8000-000000000001",
  carrier_id: "30179428-b311-4873-8d08-382901c581d8",
  name: "Express Saver",
  description: null,
  code: "",
  provider_code: "",
  min_transit_days: 0,
  max_transit_days: 0,
  supports_pickup: false,
  supports_dropoff: true,
  supports_returns: false,
  max_weight_lbs: null,
  max_length_in: null,
  max_width_in: null,
  max_height_in: null,
  supports_insurance: true,
  max_declared_value: null,
  is_international: false,
  is_residential: true,
  is_active: true,
  display_order: 0,
  created_by: "Dorado Metals",
  updated_by: "Dorado Metals",
  // STRINGS, not Dates. The contract carries the wire shape, and JSON has no
  // Date - the fixture said Date only because the hand-written interface did.
  created_at: "2025-12-30T00:26:40.731Z",
  updated_at: "2025-12-31T17:21:41.140Z",
});

describe("the carrier service shape this feature depends on", () => {
  test("every field the UI binds to is present", () => {
    const service = aService() as unknown as Record<string, unknown>;
    for (const field of FIELDS_THE_UI_READS) {
      expect(service).toHaveProperty(field);
    }
  });

  // The three that are aliases on the API side. If the migrated read ever stops
  // renaming them, these are the names that go missing.
  test.each([
    ["supports_pickup", "supports_pickups"],
    ["supports_dropoff", "supports_dropoffs"],
    ["max_weight_lbs", "max_weight_lb"],
  ])("reads %s, never the new schema's %s", (wire, newSchema) => {
    const service = aService() as unknown as Record<string, unknown>;
    expect(service).toHaveProperty(wire);
    expect(service).not.toHaveProperty(newSchema);
  });

  // The toggles are rendered with `!!service.supports_pickup`, so an absent
  // field is indistinguishable from a false one. That is the whole reason the
  // alias matters: the failure is silent and looks like data.
  test("a missing boolean would render as off rather than fail", () => {
    const incomplete = { ...aService() } as unknown as Record<string, unknown>;
    delete incomplete.supports_pickup;
    expect(!!incomplete.supports_pickup).toBe(false);
    expect(!!aService().supports_dropoff).toBe(true);
  });
});
