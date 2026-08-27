// A carrier pickup, put back into the shape exchange.carrier_pickups has.
//
// exchange hangs a pickup off an ORDER and names its carrier in a text column.
// The new schema hangs it off a SHIPMENT, and the shipment knows both - which
// is why this composes on top of the shipments service rather than walking
// fulfillments and orders again. That walk already exists there and produced
// the order id and the carrier id; doing it twice would be two definitions of
// the same reconstruction.
//
// THREE THINGS ARE PUT BACK:
//
//   order_id  - from the shipment's reconstructed purchase_order_id or
//               sales_order_id, whichever the direction filled.
//   user_id   - from the order.
//   carrier   - the carrier's NAME, from the shipment's carrier_id.
//
// AND TWO RENAMES: requested_at -> pickup_requested_at, status ->
// pickup_status. confirmation_number is TEXT here and NUMERIC on the wire, so
// it is cast back - exchange coerced whatever the carrier returned into a
// numeric column, and the response has always carried a number.
import type { PickupBaseRow } from "#features/shipping/pickups/repo.ts";

// The eight columns of exchange.carrier_pickups, which is what every caller
// reads - its own reads are `SELECT *`.
export type ComposedPickup = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  carrier: string | null;
  pickup_requested_at: Date | string | null;
  pickup_status: string | null;
  confirmation_number: number | null;
  location: string | null;
};

// What a shipment can tell a pickup about itself.
export type ShipmentContext = {
  order_id: string | null;
  user_id: string | null;
  carrier: string | null;
};

export type Lookups = {
  // shipment_id -> what that shipment knows. Absent means the shipment is gone
  // or has no order yet.
  byShipment: Map<string, ShipmentContext>;
};

// exchange's column is numeric and the carrier's value is a string. A value
// that is not a number becomes null rather than NaN - `NaN` would serialise to
// `null` on the wire anyway, and being explicit says it was considered.
const asNumber = (v: string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function compose(p: PickupBaseRow, l: Lookups): ComposedPickup {
  const ctx = p.shipment_id === null ? undefined : l.byShipment.get(p.shipment_id);
  return {
    id: p.id,
    user_id: ctx?.user_id ?? null,
    order_id: ctx?.order_id ?? null,
    carrier: ctx?.carrier ?? null,
    pickup_requested_at: p.requested_at,
    pickup_status: p.status,
    confirmation_number: asNumber(p.confirmation_number),
    location: p.location,
  };
}

// A pickup that exists in exchange and NOT in the new schema, composed from
// what was written rather than from a row that is not there.
//
// This is the answer for the case the header of service.ts is about: the
// shipment could not be resolved, so the new-schema row was skipped, and the
// caller still asked for its pickup back. exchange has it and the response has
// to carry it - returning null would tell a caller that just booked a courier
// that nothing happened.
export function composeFromWrite(
  id: string,
  written: {
    user_id?: string | null;
    order_id?: string | null;
    carrier?: string | null;
    pickup_status?: string | null;
    confirmation_number?: string | number | null;
    location?: string | null;
  },
  requested_at: Date | string | null
): ComposedPickup {
  const confirmation =
    written.confirmation_number === null || written.confirmation_number === undefined
      ? null
      : asNumber(String(written.confirmation_number));
  return {
    id,
    user_id: written.user_id ?? null,
    order_id: written.order_id ?? null,
    carrier: written.carrier ?? null,
    pickup_requested_at: requested_at,
    pickup_status: written.pickup_status ?? null,
    confirmation_number: confirmation,
    location: written.location ?? null,
  };
}

// NOTHING IS DROPPED. Every join this replaces was a LEFT JOIN, and a pickup
// whose shipment has no order yet still has to come back - with nulls where
// exchange would also show nulls. A booked courier that stopped appearing
// because its paperwork was incomplete is worse than one with a null order id.
export const composeAll = (
  rows: PickupBaseRow[], l: Lookups
): ComposedPickup[] => rows.map((p) => compose(p, l));
