// THE CARRIER'S OWN REQUEST SHAPES, built here and nowhere else (ruling 66:
// "Provider request shapes leave the domain").
//
// Each takes contract rows - an `Address`, a `Parcel` - and returns the object
// the adapter turns into FedEx's JSON. The domain asks for a label; it never
// spells `pickupType`, `totalDeclaredValue` or `personName`, which is what
// used to sit in api/domain/orders/rules.ts under three names.
//
// The business's own end of a parcel (who signs for it, where it goes) is the
// constant next door, so a use case never reads process.env to fill in a
// carrier request either.
import {
  DORADO_ADDRESS, DORADO_CONTACT, FEDEX_STORE_ADDRESS,
} from "#providers/shipments/constants.ts";
import type { Address, Parcel, ParcelSchedule } from "@dorado/contracts";

// A PURCHASE COMES TO THE STORE: the customer's own address ships it, and the
// business receives it.
export function inboundLabelRequest(
  shipper: Address, personName: string, parcel: Parcel
) {
  return {
    shipper: {
      contact: { personName, phoneNumber: shipper.phone_number ?? "" }, address: shipper,
    },
    recipient: { contact: DORADO_CONTACT, address: FEDEX_STORE_ADDRESS },
    serviceType: parcel.serviceType, pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: "USD" } },
  };
}

// SENDING A CUSTOMER'S METAL BACK: from the business's configured address to
// the one the order snapshotted.
export function returnLabelRequest(
  personName: string, recipient: Address, parcel: Parcel
) {
  return {
    shipper: { contact: DORADO_CONTACT, address: DORADO_ADDRESS },
    recipient: {
      contact: { personName, phoneNumber: recipient.phone_number ?? "" },
      address: recipient,
    },
    serviceType: parcel.serviceType,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: "USD" } },
  };
}

// The courier comes for the label that was just bought, which is why the
// tracking number is an argument rather than a field of the parcel.
export function pickupRequest(
  shipper: Address, personName: string, parcel: Parcel,
  schedule: ParcelSchedule, trackingNumber: string | null
) {
  return {
    pickupContact: { personName, phoneNumber: shipper.phone_number ?? "" },
    pickupAddress: shipper, pickupDate: schedule.date, pickupTime: schedule.time,
    carrierCode: parcel.carrierCode, trackingNumber,
  };
}

// WHAT A CARRIER IS ASKED TO PRICE: the parcel itself, without either end -
// domain/shipping/operations/service.ts's quoteRate resolves the two addresses
// from the direction.
export function rateParcel(parcel: Parcel) {
  return {
    pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    declaredValue:
      parcel.declaredValue > 0
        ? { amount: parcel.declaredValue, currency: "USD" }
        : undefined,
  };
}
