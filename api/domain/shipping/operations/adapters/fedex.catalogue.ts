// FEDEX'S OWN WORDS, DECLARED ONCE, ON THE SERVER.
//
// This file exists because the BROWSER used to hold them. `pickupOptions` in
// frontend/features/handoff/types.ts was a record KEYED BY
// DROPOFF_AT_FEDEX_LOCATION and CONTACT_FEDEX_TO_SCHEDULE, and
// frontend/features/service/types.ts hand-rolled FEDEX_EXPRESS_SAVER,
// PRIORITY_OVERNIGHT and the FDXE carrier code - so three checkout components
// branched on a carrier's enum values, and a second carrier could not have been
// added without editing React. That is the same defect class the wire
// conversion fixed everywhere else: the frontend renders what the API gives it
// and sends back an id.
//
// *** THE WORD "PICKUP" MEANS TWO DIFFERENT THINGS ON THIS PROJECT, AND THIS
//     FILE IS ABOUT THE CARRIER ONE (Jacob, correcting the coordinator). ***
//
//   fulfillments.pickups                    DORADO'S OWN pickup. The business
//                                           collects the metal itself. A
//                                           fulfillment METHOD, alongside
//                                           directs and shipments. NOT THIS.
//   shipping.shipments.pickup_type,         THE CARRIER's. FedEx collects the
//   exchange.carrier_pickups                parcel, or the customer drops it at
//                                           a FedEx location. A property of a
//                                           SHIPMENT. THIS.
//
// The database already keeps them apart. Nothing here may be merged with, or
// renamed towards, the fulfillments side. "Handoff" is used for the carrier
// concept precisely because it cannot be misread as either one - it is how a
// parcel reaches the carrier - and because frontend/features/handoff already
// uses the word for exactly this.
//
// WHY THESE ARE CONSTANTS AND NOT ROWS. shipping.services exists and would be
// the right home for the service half, but `code` and `provider_code` are NULL
// on all eight production rows and on all eight dev rows - measured, not
// assumed - so the table cannot say which FedEx service a row means. Populating
// them is an UPDATE against production and therefore Jacob's, not a migration
// this wave may run. Until then the catalogue is served from here, at the same
// URL the table-backed version will serve, so that swap is a change of source
// and not a change of surface.
//
import type { CarrierHandoff, CarrierServiceOption } from "@dorado/contracts";

// TWO VALUES BELOW ARE LOAD-BEARING BEYOND DISPLAY AND MUST NOT BE "TIDIED":
//
//   `name` IS NOT A DISPLAY STRING. Three things read it, and none of them is a
//   foreign key or a constraint - they are values in different modules that
//   must agree, which is the shape every coupling bug on this project has had:
//     - features/orders/intake.ts indexes `handoffMethods` BY IT to choose the
//       fulfillment method, and THROWS on a name it does not know;
//     - features/orders/service.ts BOOKS A COURIER when it equals
//       "Carrier Pickup", so the string decides whether FedEx is dispatched to
//       a customer's door;
//     - it is written to shipments.pickup_type verbatim - production holds 62
//       rows reading exactly 'Store Dropoff' - and features/media/pdfs compares
//       against that string twice to decide what a packing list prints.
//   handoffs/tests/unit.test.ts pins all three. Renaming one here alone breaks
//   order creation outright.
//
//   `code` is round-tripped by the browser into the FedEx label request
//   (pickup.label -> pickupType). The frontend never interprets it - that is
//   the point - but it is still FedEx's enum on the way back out, so the values
//   here are the values FedEx accepts.

// THE SHAPES LIVE IN @dorado/contracts, because they are a WIRE shape and both
// halves of the app need them - they were declared twice the moment the read
// existed, once here and once in frontend/features/shipping/types.ts, which is
// the duplication the contracts package exists to prevent. Every field is
// documented there, including why `name` is not a display string.
export type { CarrierHandoff, CarrierServiceOption };

// THE CARRIER'S HALF OF A SERVICE OPTION, WHICH IS NOT ALL OF ONE.
//
// `max_insured_value` is on the wire shape and is deliberately NOT here: it is
// DORADO's policy (shipping.services.max_insured_value, migration 097), not
// FedEx's vocabulary, and a carrier adapter that could state it would be the
// same defect this file exists to fix in the other direction.
// features/shipping/services/service.ts joins the two.
type CarrierServiceVocabulary = Omit<CarrierServiceOption, "max_insured_value" | "id">;

type CarrierCatalogue = {
  handoffs: CarrierHandoff[];
  services: CarrierServiceVocabulary[];
};

// Order is the order the selectors render in, and it is the order the browser
// used to get from Object.keys() on a literal - dropoff first, then pickup;
// Express Saver, then Priority Overnight.
export const CATALOGUE: CarrierCatalogue = {
  handoffs: [
    {
      code: "DROPOFF_AT_FEDEX_LOCATION",
      name: "Store Dropoff",
      requires_schedule: false,
      has_dropoff_locations: true,
      display_order: 0,
    },
    {
      code: "CONTACT_FEDEX_TO_SCHEDULE",
      name: "Carrier Pickup",
      requires_schedule: true,
      has_dropoff_locations: false,
      display_order: 1,
    },
  ],
  services: [
    // FEDEX_GROUND (FDXG) was commented out in the browser's copy and stays
    // out. Reinstating it is a business decision about what we offer, not a
    // relocation, so it is not made here.
    {
      code: "FEDEX_EXPRESS_SAVER",
      name: "Express Saver",
      carrier_code: "FDXE",
      display_order: 0,
    },
    {
      code: "PRIORITY_OVERNIGHT",
      name: "Priority Overnight",
      carrier_code: "FDXE",
      display_order: 1,
    },
  ],
};
