// FedEx's own words, declared once, on the server - not duplicated across checkout components that used to branch on a carrier's enum values by hand.
// "Pickup" means two different things here, and this file is the CARRIER one: fulfillments.pickups is DORADO'S OWN pickup (NOT this); shipping.shipments.pickup_type is what the CARRIER does (THIS).
// "Handoff" names the carrier concept precisely because it can't be misread as either - frontend/features/handoff already uses the word.
// Constants, not shipping.services rows: code/provider_code are NULL on every row in prod and dev, so the table can't say which FedEx service a row means - filling them is an UPDATE against production, Jacob's to run.
import type { CarrierHandoff, CarrierServiceOption } from "@dorado/contracts";

// TWO VALUES BELOW ARE LOAD-BEARING BEYOND DISPLAY AND MUST NOT BE "TIDIED":
//   `name` IS NOT A DISPLAY STRING - three modules key off its exact value: orders/intake.ts indexes handoffMethods by it and THROWS on an unknown name; orders/service.ts BOOKS A COURIER when it equals "Carrier Pickup"; and it's written to shipments.pickup_type verbatim, compared twice by media/pdfs to decide what a packing list prints. handoffs/tests/unit.test.ts pins all three - renaming it here alone breaks order creation outright.
//   `code` is round-tripped by the browser into the FedEx label request unread - it's still FedEx's enum on the way back out, so the values here are the values FedEx accepts.

// Shapes live in @dorado/contracts (a wire shape both halves need) - every field is documented there too, including why `name` isn't a display string.

// The carrier's half of a service option, not all of one: max_insured_value is DORADO's policy, not FedEx's vocabulary - a carrier adapter stating it would be the same defect this file exists to fix, in reverse. domain/shipping/services/service.ts joins the two.
type CarrierServiceVocabulary = Omit<CarrierServiceOption, "max_insured_value" | "id">;

type CarrierCatalogue = {
  handoffs: CarrierHandoff[];
  services: CarrierServiceVocabulary[];
};

// Order is the order the selectors render in: dropoff before pickup, Express Saver before Priority Overnight.
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
    // FEDEX_GROUND (FDXG) stays out - reinstating it is a business decision about what we offer, not something to make here.
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
