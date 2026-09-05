import { z } from 'zod/v4'
import { Truck, Store, type IconProps } from '@dorado/icons'
// HOW A PARCEL REACHES THE CARRIER - the customer drops it at the carrier's
// location, or the carrier comes and collects it.
//
// *** THIS IS NOT features/fulfillments. Two different things share the word
//     "pickup" (Jacob, correcting the coordinator):
//
//       fulfillments.pickups   DORADO'S OWN pickup - the business collects the
//                              metal itself. A fulfillment METHOD.
//       THIS                   THE CARRIER's - FedEx collects the parcel, or
//                              the customer drops it at a FedEx location. A
//                              property of a SHIPMENT.
//
//     The database keeps them apart. Nothing here may be merged with or renamed
//     towards the fulfillments side. ***
//
// WHAT USED TO BE HERE, AND WHY IT IS GONE. This file held `pickupOptions`, a
// record KEYED BY DROPOFF_AT_FEDEX_LOCATION and CONTACT_FEDEX_TO_SCHEDULE -
// FedEx's own enum values, hand-written in the browser - and three checkout
// components branched on those strings to decide what to render next. The
// frontend should not know what a FedEx anything is called: it renders what the
// API gives it and sends back an id (ruling 12, rows out and ids in).
//
// The options come from GET /api/shipping/handoffs now
// (useCarrierHandoffs, features/shipping/queries). The frontend reads `name`
// and branches on `requires_schedule` / `has_dropoff_locations`; `code` is
// opaque to it and is simply handed back.
//
// The ICON is the one thing that stays here, and deliberately (Jacob: "icons
// stay a client-side map beside the selector, we'll figure out the icon thing
// later"). An icon is a client concern and has no business on the wire.
//
// `PickupType` went with the constant it described - it was the shape of a
// `pickupOptions` entry and nothing else ever referenced it. Ruling 32: the
// dead ones go rather than being kept in case.

// THE CHECKOUT FORM'S PICKUP BLOCK. `PurchaseCheckoutForm.pickup`
// (features/orders/purchaseOrders/types.ts) is a `z.infer` of this schema,
// and its shape is what the order create body carries, so it does not move
// while the create still takes the composed checkout.
//
// It matches no table by design, which is why `audit:frontend-nullability`
// reports it 0-of-6 against carrier_pickups: it is a FORM schema, and a form
// schema being stricter than a column is the audit's own documented
// false-positive class rather than a defect. It is NOT dead - three files in
// features/orders compose it into the checkout and return-shipment schemas.
export const pickupSchema = z.object({
  label: z.string(),
  name: z.string(),
  icon: z.any().optional(),
  selectedDate: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
})

// CHOSEN BY WHAT THE OPTION DOES, NOT BY WHAT IT IS CALLED - which is what
// keeps the last carrier string out of this tree. A map keyed by
// DROPOFF_AT_FEDEX_LOCATION would have been the obvious shape and would have
// left the browser spelling FedEx's enum for the sake of a picture. The carrier
// comes to you (truck) or you go to the carrier (storefront), and both are
// answered by flags the API already sends.
export const handoffIcon = (handoff: {
  requires_schedule?: boolean
}): React.ComponentType<IconProps> => (handoff.requires_schedule ? Truck : Store)
