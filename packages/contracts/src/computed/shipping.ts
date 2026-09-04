import { z } from "zod/v4";
import { ShipmentRead } from "../shipping/shipments.js";
import { CarrierServiceRead } from "../shipping/services.js";
import { PackageRead } from "../shipping/packages.js";
import { ShipmentPickup } from "../shipping/pickups.js";

// computed: no table backs these. A PARCEL'S PROGRESS is a derivation over
// shipping.tracking's scan rows, and what may be done to a parcel is read from
// the shipment, its service and its carrier booking at once.
//
// Every one of them was the browser's until this pass. `TrackingEvents.tsx`
// held the four master stages as a literal, filtered "Label Created" out,
// deduplicated scans by status+location, worked out which stages were still to
// come, and sorted the lot - roughly forty lines of business reasoning about
// what a carrier's scans MEAN, in a component. `useShipmentDisplay` joined the
// shipment to the cached carrier-services list to find its name and its
// carrier. api/domain/shipping/rules.ts owns both now.

// ONE RUNG OF THE PROGRESS TIMELINE. `reached` is what makes a rung solid: a
// stage the carrier has actually scanned carries its location and its time, a
// stage still to come carries neither and is drawn faint.
export const TrackingStep = z.object({
  stage: z.string(),
  location: z.string().nullable(),
  scan_time: z.string().nullable(),
  reached: z.boolean(),
});
export type TrackingStep = z.infer<typeof TrackingStep>;

// WHAT MAY BE DONE TO A PARCEL.
//
//   track             POST /shipping/get_tracking - there is a label to ask
//                     the carrier about, and a carrier to ask
//   cancel_label      POST /shipping/cancel_label - admin; a label that has
//                     already moved or been cancelled is not cancellable
//   edit_charge       PATCH /shipments/:id shipping_charge / shipping_actual
//   edit_tracking     PATCH /shipments/:id tracking_number - the hand-entered
//                     pair, offered only where the parcel has no label of ours
//   show_instructions the customer still has the parcel: print, pack, hand it
//                     over. False the moment the carrier scans it.
export const ShipmentActions = z.object({
  track: z.boolean(),
  cancel_label: z.boolean(),
  edit_charge: z.boolean(),
  edit_tracking: z.boolean(),
  show_instructions: z.boolean(),
});
export type ShipmentActions = z.infer<typeof ShipmentActions>;

// THE SHIPMENT VIEW - one parcel, assembled from its tables.
//
// `service` and `package` are the ROWS the shipment names by id: the browser
// used to hold both reference lists and `find` its way to a name, which is a
// join. `carrier_pickup` is the carrier's booking against this parcel - the
// most recent of them, because a rebooking supersedes the attempt before it.
//
// `tracking_status` is the parcel's own `shipping_status` normalised to the
// stage vocabulary `timeline` uses, so a screen prints one word rather than
// mapping a carrier's string itself. `handoff_at` is when the courier is due,
// which is the one fact the packing instructions need and the only reason a
// customer surface ever read a carrier pickup.
export const ShipmentView = z.object({
  shipment: ShipmentRead,
  service: CarrierServiceRead.nullable(),
  carrier_id: z.string().nullable(),
  package: PackageRead.nullable(),
  carrier_pickup: ShipmentPickup.nullable(),
  handoff_at: z.string().nullable(),
  tracking_status: z.string().nullable(),
  timeline: z.array(TrackingStep),
  actions: ShipmentActions,
});
export type ShipmentView = z.infer<typeof ShipmentView>;
