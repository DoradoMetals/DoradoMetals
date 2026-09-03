// CARRIER HANDOFF OPTIONS: how a parcel gets from the customer to the carrier.
//
// *** READ THE NAME CAREFULLY. THIS IS NOT fulfillments.pickups. ***
//
// Two different things on this project share the word "pickup", and Jacob has
// corrected one agent about it already:
//
//   fulfillments.pickups        DORADO collects the metal itself. A fulfillment
//                               METHOD, alongside directs and shipments.
//   THIS                        THE CARRIER collects the parcel - or the
//                               customer drops it at the carrier's location.
//                               A property of a SHIPMENT
//                               (shipping.shipments.pickup_type).
//
// The database keeps them apart; the collision is in how we talk about them.
// This resource is called `handoffs` so that it cannot be misread as either
// one, and because frontend/features/handoff already uses that word for exactly
// this. Never say "pickup" unqualified about a carrier.
//
// THERE IS NO REPO AND NO TABLE, and that is the decision rather than an
// omission (the convention CLAUDE.md sets for a resource with no HTTP surface,
// applied the other way round). `shipments.pickup_type` is a text column
// holding one of two values a carrier defines; the values belong to the
// carrier, so they live with the carrier's adapter and are resolved through the
// same registry that resolves its provider and its request builders. When a
// carrier's options become rows, this service changes where it reads from and
// the URL does not move.
import {
  carrierIdOr,
  resolveCarrier,
} from "#domain/shipping/operations/resolver.ts";
// From the contracts, which is where the shape is declared - not via the
// adapter, which merely re-exports it for a reader of that file.
import type { CarrierHandoff } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

export type { CarrierHandoff };

// carrier_id is optional: exactly one carrier has a provider registered, so the
// server can answer "which carrier" without the browser holding a uuid. See
// resolveShippingCarrierId for why that is a fact about the code rather than a
// business preference.
export async function getHandoffs(
  carrier_id?: string | null, client?: Executor
): Promise<CarrierHandoff[]> {
  const id = await carrierIdOr(carrier_id, client);
  const { catalogue } = await resolveCarrier(id, client);

  // Sorted here rather than trusted from the constant, so the wire's order is
  // stated by the field that means it. The selectors render in this order.
  return [...catalogue.handoffs].sort((a, b) => a.display_order - b.display_order);
}
