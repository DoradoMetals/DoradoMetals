import { DORADO_ADDRESS, DORADO_CONTACT } from '#providers/fedex/constants.ts'
import type { Address, HoldAtLocation, Parcel, ParcelSchedule } from '@dorado/contracts'

// `hold` is where the parcel waits to be collected, and it comes from the
// caller because it is a row of places.locations (ruling 89). The inbound leg
// travels TO that place; the return leg is held THERE for the customer.
export function inboundLabelRequest(
  shipper: Address,
  personName: string,
  parcel: Parcel,
  hold: HoldAtLocation
) {
  return {
    shipper: {
      contact: { personName, phoneNumber: shipper.phone_number ?? '' },
      address: shipper,
    },
    recipient: { contact: DORADO_CONTACT, address: hold.address },
    serviceType: parcel.serviceType,
    pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: 'USD' } },
    hold,
  }
}

export function returnLabelRequest(
  personName: string,
  recipient: Address,
  parcel: Parcel,
  hold: HoldAtLocation
) {
  return {
    shipper: { contact: DORADO_CONTACT, address: DORADO_ADDRESS },
    recipient: {
      contact: { personName, phoneNumber: recipient.phone_number ?? '' },
      address: recipient,
    },
    serviceType: parcel.serviceType,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: 'USD' } },
    hold,
  }
}

export function pickupRequest(
  shipper: Address,
  personName: string,
  parcel: Parcel,
  schedule: ParcelSchedule,
  trackingNumber: string | null
) {
  return {
    pickupContact: { personName, phoneNumber: shipper.phone_number ?? '' },
    pickupAddress: shipper,
    pickupDate: schedule.date,
    pickupTime: schedule.time,
    carrierCode: parcel.carrierCode,
    trackingNumber,
  }
}

export function rateParcel(parcel: Parcel) {
  return {
    pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    declaredValue:
      parcel.declaredValue > 0 ? { amount: parcel.declaredValue, currency: 'USD' } : undefined,
  }
}
