import { z } from "zod/v4";

// computed: no table backs these. The carrier PROVIDER catalogue - what FedEx
// offers, as the checkout surface reads it - is assembled by the provider
// adapter, not selected from a table, so there is no Row to derive from.
// `max_insured_value` is the one field that IS a column, and it is joined on
// (migration 097).


// ============================================================================
// THE CARRIER'S OWN CATALOGUE - reference reads with no table behind them.
// ============================================================================
//
// GET /api/shipping/handoffs and GET /api/carrier_services/offered. Both were
// HAND-WRITTEN IN THE BROWSER until wave 5B: `pickupOptions` keyed by
// DROPOFF_AT_FEDEX_LOCATION / CONTACT_FEDEX_TO_SCHEDULE, and `serviceOptions`
// keyed by FEDEX_EXPRESS_SAVER / PRIORITY_OVERNIGHT carrying FedEx's FDXE code,
// with three checkout components branching on those strings. The API owns a
// carrier's vocabulary; the frontend renders `name`, branches on the flags, and
// hands `code` back without reading it (ruling 12, rows out and ids in).
//
// THEY ARE NOT DERIVED FROM A TABLE, and that is measured rather than assumed:
// shipping.services exists and would be the right source, but `code` and
// `provider_code` are NULL on all eight rows in production AND all eight in
// dev, so no row can say which carrier service it means. Filling them is an
// UPDATE against production. Until then the values live with the carrier's
// adapter (api/features/shipping/operations/adapters/) and these describe the
// shape they are served in - so populating the columns later changes the read's
// SOURCE and not its SURFACE.
//
// They are declared here rather than in either half because they were declared
// TWICE the moment the read existed - once for the service, once for the hook -
// and two hand-written copies of one wire shape is the defect the contracts
// package exists to prevent.

// HOW A PARCEL REACHES THE CARRIER: the customer drops it at the carrier's
// location, or the carrier collects it.
//
// *** NOT FulfillmentPickup. *** Two different things share the word "pickup"
// (Jacob, correcting the coordinator): fulfillments.pickups is DORADO
// collecting the metal itself, a fulfillment METHOD; this is THE CARRIER's, a
// property of a SHIPMENT (shipping.shipments.pickup_type). The database keeps
// them apart and nothing may merge them.
export const CarrierHandoff = z.object({
  // The carrier's own value. Round-tripped by the client into the label
  // request; never interpreted by it.
  code: z.string(),
  // What a customer reads - AND what lands in shipments.pickup_type verbatim,
  // which is why it is not a client-side label. features/orders/intake.ts
  // indexes its handoff table BY THIS STRING and throws on one it does not
  // know, features/orders/service.ts books a courier when it is
  // "Carrier Pickup", and features/media/pdfs branches a packing list on
  // "Store Dropoff". Three readers, no constraint between them; pinned by
  // api/features/shipping/handoffs/tests/unit.test.ts.
  name: z.string(),
  // The client collects a date and a time slot for this option.
  requires_schedule: z.boolean(),
  // The client shows a map of places the parcel may be left.
  has_dropoff_locations: z.boolean(),
  display_order: z.number(),
});
export type CarrierHandoff = z.infer<typeof CarrierHandoff>;

// A SERVICE WE OFFER AT CHECKOUT, which is not the same list as
// shipping.services holds - eight rows across two carriers, two of them
// offered. `code` matches a rate quote's serviceType, which is how the selector
// joins the catalogue to live prices; `carrier_code` is the service FAMILY a
// pickup-availability check wants (FDXE express, FDXG ground), a property of
// the service and not of the carrier.
export const CarrierServiceOption = z.object({
  // The shipping.services ROW this catalogue entry corresponds to (D208):
  // what the checkout row stores as carrier_service_id, joined by name the
  // same way the ceiling is. Null only if the table lost the row.
  id: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  carrier_code: z.string(),
  display_order: z.number(),
  // THE ONE FIELD HERE THAT IS A ROW AND NOT A CONSTANT (migration 097).
  //
  // What Dorado will insure a parcel moving on this service for, in USD -
  // `shipping.services.max_insured_value`, joined onto the adapter's catalogue
  // by (carrier_id, name) because `code` is still NULL on every row (D125).
  // NOT the carrier's own ceiling: FedEx allows $50,000, this is 10,000
  // (Jacob, 2026-08-29).
  //
  // *** THE CLIENT MUST NOT CLAMP WITH IT. *** This number is here so a screen
  // can SAY what a parcel is covered for. The clamp itself is applied by the
  // server, in /quotes/purchase_order and again when the label is bought -
  // `Math.min(quote.declared_value, 50000)` in checkoutStepper.tsx is the
  // defect 097 removes (D132, and D82: the frontend computes no money).
  max_insured_value: z.number(),
});
export type CarrierServiceOption = z.infer<typeof CarrierServiceOption>;

// ONE PRICED SERVICE, flat because the provider's own answer already is -
// providers/shipments/utils/parsing.ts's parseRates. Not every carrier fills
// every field; a value the provider omitted is null, not absent. No table
// backs a rate quote: it is what FedEx said when asked, and it is never
// stored.
export const CarrierRateQuote = z.object({
  serviceType: z.string().nullable(),
  packagingType: z.string().nullable(),
  netCharge: z.number().nullable(),
  currency: z.string(),
  deliveryDay: z.string().nullable(),
  transitTime: z.string().nullable(),
  serviceDescription: z.string().nullable(),
});
export type CarrierRateQuote = z.infer<typeof CarrierRateQuote>;

// GET /api/checkout/rates?direction= - the carrier's quote for the parcel the
// caller's checkout row describes, JOINED to the service catalogue server-side
// (this lane). The browser used to hold both lists and pair them by `code`,
// which is a join, so it is the server's; `carrier_service_id` is the id a
// PATCH sends back and `selected` is what the row already holds.
export const CheckoutRate = CarrierRateQuote.extend({
  carrier_service_id: z.string().uuid().nullable(),
  name: z.string(),
  carrier_code: z.string(),
  display_order: z.number(),
  max_insured_value: z.number(),
  selected: z.boolean(),
});
export type CheckoutRate = z.infer<typeof CheckoutRate>;

// ============================================================================
// WHAT A CARRIER SAYS WHEN ASKED ABOUT A PLACE OR A DATE.
// ============================================================================
//
// Neither is stored and neither has a table: they are the provider adapter's
// parse of somebody else's payload (api/providers/shipments/utils/parsing.ts),
// which is exactly the computed exception. They were declared by hand in
// `frontend/features/shipping/types.ts` - the browser's own copy of a shape it
// does not control - and that file is gone.

// One collection window the carrier will honour: a date, and the ready times
// on it that have not already passed. A date with no times left is dropped by
// the parser, so an entry here is always offerable.
export const CarrierPickupWindow = z.object({
  pickupDate: z.string(),
  times: z.array(z.string()),
});
export type CarrierPickupWindow = z.infer<typeof CarrierPickupWindow>;

// A drop-off point. `operatingHours` is keyed by upper-case day name with a
// "begins - ends" string, or "Closed"; absent when the carrier sent no hours,
// which is different from closed every day.
export const CarrierLocation = z.object({
  locationId: z.string(),
  locationType: z.string(),
  distance: z.object({
    value: z.number().nullable(),
    units: z.string(),
  }),
  address: z.object({
    streetLines: z.array(z.string()),
    city: z.string(),
    stateOrProvinceCode: z.string(),
    postalCode: z.string(),
    countryCode: z.string(),
  }),
  contact: z.object({
    companyName: z.string(),
    phoneNumber: z.string(),
  }),
  operatingHours: z.record(z.string(), z.string()).optional(),
  geoPositionalCoordinates: z
    .object({ latitude: z.number(), longitude: z.number() })
    .nullable(),
});
export type CarrierLocation = z.infer<typeof CarrierLocation>;

// The answer to "where can I drop this off near here": the geocode the carrier
// matched the address to, and the points around it.
export const CarrierLocations = z.object({
  matchedAddressGeoCoord: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
  locations: z.array(CarrierLocation),
});
export type CarrierLocations = z.infer<typeof CarrierLocations>;

// THE CARRIER FACTS BEHIND ONE `shipping.services` ROW, resolved from its id -
// the catalogue entry plus the carrier that sells it. A label needs three
// things the table does not hold (which carrier buys it, the carrier's own
// service type, the service family), and all three live in the catalogue,
// joined to the row by name. It was a hand-written type in
// api/domain/shipping/services/service.ts, which also renamed `code` to
// `serviceType` and `carrier_code` to `carrierCode` on the way through; the
// carrier's own spellings are kept here instead.
export const LabelService = CarrierServiceOption.extend({
  carrier_id: z.string().uuid(),
});
export type LabelService = z.infer<typeof LabelService>;
