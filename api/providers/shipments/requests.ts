import {
  DORADO_ADDRESS, DORADO_CONTACT, FEDEX_STORE_ADDRESS,
} from "#providers/shipments/constants.ts";
import type { Address, Parcel, ParcelSchedule } from "@dorado/contracts";

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
