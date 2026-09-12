import type { HoldAtLocation } from '@dorado/contracts'
import { formatAddressForFedEx } from '#providers/fedex/utils/formatting.ts'

type AddressLike = {
  streetLines?: unknown
  line_1?: string | null
  line_2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country_code?: string | null
  is_residential?: boolean | null
}

type ContactLike = {
  personName?: string | null
  name?: string | null
  phoneNumber?: string | null
  phone?: string | null
}

type PackageLike = { weight?: unknown; dimensions?: unknown } | null | undefined

function toFedexContact(contact: ContactLike | null | undefined) {
  const c = contact ?? {}
  const personName = String(c.personName ?? c.name ?? '').trim()
  const phoneNumber = String(c.phoneNumber ?? c.phone ?? '').trim()

  return { personName, phoneNumber }
}

function toFedexAddress(address: AddressLike | null | undefined) {
  if (!address) return address
  if (Array.isArray(address.streetLines)) return address

  return formatAddressForFedEx(address)
}

export function validateAddressInput({ address }: { address?: AddressLike | null }) {
  return address
}

type RatesInput = {
  shipperAddress?: AddressLike | null
  recipientAddress?: AddressLike | null
  pickupType?: string
  pkg?: PackageLike
  declaredValue?: unknown
  carrierCodes?: string[]
}

export function getRatesInput(input?: RatesInput | null) {
  const { shipperAddress, recipientAddress, pickupType, pkg, declaredValue, carrierCodes } =
    input ?? {}

  return {
    shipperAddress: toFedexAddress(shipperAddress),
    recipientAddress: toFedexAddress(recipientAddress),
    pickupType,
    packageDetails: {
      weight: pkg?.weight,
      dimensions: pkg?.dimensions,
      groupPackageCount: '1',
    },
    declaredValue,
    carrierCodes: carrierCodes ?? ['FDXE'],
  }
}

type LabelInput = {
  shipper?: { contact?: ContactLike | null; address?: AddressLike | null } | null
  recipient?: { contact?: ContactLike | null; address?: AddressLike | null } | null
  serviceType?: string
  pickupType?: string
  pkg?: PackageLike
  insurance?: { declaredValue?: unknown } | null
  options?: unknown
  label?: { imageType?: string; labelStockType?: string }
  hold?: HoldAtLocation | null
}

function toHoldAtLocation(hold?: HoldAtLocation | null) {
  if (!hold) return null
  return {
    specialServiceTypes: ['HOLD_AT_LOCATION'],
    holdAtLocationDetail: {
      locationId: hold.code,
      locationContactAndAddress: {
        address: toFedexAddress(hold.address),
        contact: { phoneNumber: hold.phone_number, companyName: hold.company_name },
      },
      locationType: hold.type,
    },
  }
}

export function createLabelInput(input?: LabelInput | null) {
  const { shipper, recipient, serviceType, pickupType, pkg, insurance, options, label, hold } =
    input ?? {}

  const totalDeclaredValue = insurance?.declaredValue ?? null
  return {
    shipper: {
      contact: toFedexContact(shipper?.contact),
      address: toFedexAddress(shipper?.address),
    },
    recipient: {
      contact: toFedexContact(recipient?.contact),
      address: toFedexAddress(recipient?.address),
    },
    serviceType,
    pickupType,
    packageDetails: {
      weight: pkg?.weight,
      dimensions: pkg?.dimensions,
      declaredValue: totalDeclaredValue ?? undefined,
    },
    totalDeclaredValue,
    label: label ?? { imageType: 'PNG', labelStockType: 'PAPER_4X6' },
    specialServices: toHoldAtLocation(hold),
    options,
  }
}

export function cancelLabelInput(
  input?: { trackingNumber?: string | null; tracking_number?: string | null } | null
) {
  return {
    tracking_number: input?.trackingNumber ?? input?.tracking_number,
  }
}

export function checkPickupInput(
  input?: {
    pickupAddress?: AddressLike | null
    code?: string
    readyDate?: Date | string | number
  } | null
) {
  const { pickupAddress, code, readyDate } = input ?? {}

  return {
    pickupAddress: toFedexAddress(pickupAddress),
    code,
    readyDate: readyDate instanceof Date ? readyDate : new Date(readyDate!),
  }
}

type CreatePickupInput = {
  pickupContact?: ContactLike | null
  pickupAddress?: AddressLike | null
  pickupDate?: string | null
  pickupTime?: string | null
  carrierCode?: string | null
  trackingNumber?: string | null
  packageLocation?: string | null
}

export function createPickupInput(input?: CreatePickupInput | null) {
  const {
    pickupContact,
    pickupAddress,
    pickupDate,
    pickupTime,
    carrierCode,
    trackingNumber,
    packageLocation,
  } = input ?? {}

  return {
    pickupContact: toFedexContact(pickupContact),
    pickupAddress: toFedexAddress(pickupAddress),
    pickupDate,
    pickupTime,
    carrierCode,
    trackingNumber,
    packageLocation,
  }
}

export function cancelPickupInput(
  input?: {
    confirmationCode?: string | null
    confirmation_number?: string | number | null
    pickupDate?: string | null
    pickup_requested_at?: string | Date | null
    location?: string | null
  } | null
) {
  return {
    confirmationCode: input?.confirmationCode ?? input?.confirmation_number,
    pickupDate: input?.pickupDate ?? input?.pickup_requested_at,
    location: input?.location,
  }
}

export function getLocationsInput(
  input?: { address?: AddressLike | null; radiusMiles?: number; maxResults?: number } | null
) {
  const { address, radiusMiles = 25, maxResults = 10 } = input ?? {}
  return {
    address: toFedexAddress(address),
    radiusMiles,
    maxResults,
  }
}

export function getTrackingInput(input?: { tracking_number?: string | null } | null) {
  return {
    tracking_number: input?.tracking_number,
  }
}
