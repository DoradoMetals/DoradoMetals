import { DEFAULT_EMAIL_NOTIFICATION_DETAIL } from '#providers/carriers/fedex/constants.ts'
import { accountNumber } from '#providers/carriers/fedex/endpoints.ts'
import {
  formatFedexTime,
  normalizeTime,
  formatFedexFullDateTime,
  addHours,
} from '#providers/carriers/fedex/utils/formatting.ts'

type FedexAddress = Record<string, unknown>
type PackageDetails = Record<string, unknown>

type RateQuoteInput = {
  shipperAddress: FedexAddress
  recipientAddress: FedexAddress
  packageDetails: PackageDetails
  pickupType?: string
  declaredValue?: { amount?: number; currency?: string } | null
  carrierCodes?: string[]
}

type CreateShipmentInput = {
  shipper: Record<string, unknown>
  recipient: Record<string, unknown>
  serviceType?: string
  pickupType?: string
  packageDetails: PackageDetails
  totalDeclaredValue?: { amount?: number; currency?: string } | null
  label?: Record<string, unknown>
  specialServices?: Record<string, unknown> | null
  emailNotificationDetail?: Record<string, unknown> | null
  options?: { emailNotifications?: boolean }
}

type PickupAvailabilityInput = {
  pickupAddress: FedexAddress
  code?: string
  readyDate: Date
}

type SchedulePickupInput = Record<string, any>
type CancelPickupInput = Record<string, any>
type LocationsInput = Record<string, any>

export function validateAddressPayload(address: FedexAddress) {
  return {
    addressesToValidate: [
      {
        address: {
          streetLines: [address.line_1, address.line_2].filter(Boolean),
          city: address.city,
          stateOrProvinceCode: address.state,
          postalCode: address.zip,
          countryCode: address.country_code,
        },
        addressVerificationOptions: {
          checkResidentialStatus: true,
        },
      },
    ],
  }
}

export function rateQuotePayload({
  shipperAddress,
  recipientAddress,
  packageDetails,
  pickupType,
  declaredValue,
  carrierCodes = ['FDXE'],
}: RateQuoteInput) {
  return {
    accountNumber: { value: accountNumber() },
    rateRequestControlParameters: { returnTransitTimes: true },
    requestedShipment: {
      shipDateStamp: new Date().toISOString().split('T')[0],
      shipper: { address: shipperAddress },
      recipient: { address: recipientAddress },
      pickupType,
      packagingType: 'YOUR_PACKAGING',
      preferredCurrency: 'USD',
      rateRequestType: ['PREFERRED', 'LIST'],
      requestedPackageLineItems: [
        {
          ...packageDetails,
          groupPackageCount: '1',
          declaredValue,
        },
      ],
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: {
          responsibleParty: {
            accountNumber: { value: accountNumber() },
          },
        },
      },
    },
    carrierCodes,
  }
}

export function createShipmentPayload({
  shipper,
  recipient,
  serviceType,
  pickupType,
  packageDetails,
  totalDeclaredValue,
  label,
  specialServices,
  emailNotificationDetail,
  options,
}: CreateShipmentInput) {
  const wantsEmailNotifications = options?.emailNotifications !== false

  const resolvedEmailNotificationDetail =
    wantsEmailNotifications && !emailNotificationDetail
      ? DEFAULT_EMAIL_NOTIFICATION_DETAIL
      : emailNotificationDetail

  return {
    accountNumber: { value: accountNumber() },
    labelResponseOptions: 'LABEL',
    requestedShipment: {
      shipper,
      recipients: [recipient],
      packagingType: 'YOUR_PACKAGING',
      serviceType,
      pickupType,
      groupPackageCount: 1,
      totalDeclaredValue: totalDeclaredValue ?? undefined,
      requestedPackageLineItems: [packageDetails],
      labelSpecification: {
        imageType: label?.imageType ?? 'PNG',
        labelStockType: label?.labelStockType ?? 'PAPER_4X6',
      },
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: {
          responsibleParty: {
            accountNumber: { value: accountNumber() },
          },
        },
      },
      shipmentSpecialServices: specialServices ?? undefined,
      emailNotificationDetail: resolvedEmailNotificationDetail ?? undefined,
    },
  }
}

export function cancelShipmentPayload(trackingNumber: string) {
  return {
    accountNumber: { value: accountNumber() },
    trackingNumber,
  }
}

export function pickupAvailabilityPayload({
  pickupAddress,
  code,
  readyDate,
}: PickupAvailabilityInput) {
  const packageReadyTime = formatFedexTime(readyDate)

  return {
    pickupAddress,
    pickupRequestType: ['FUTURE_DAY'],
    carriers: [code],
    countryRelationship: 'DOMESTIC',
    numberOfBusinessDays: 3,
    associatedAccountNumber: accountNumber(),
    packageReadyTime,
  }
}

export function schedulePickupPayload({
  pickupContact,
  pickupAddress,
  pickupDate,
  pickupTime,
  carrierCode,
  trackingNumber,
  packageLocation = 'FRONT',
}: SchedulePickupInput) {
  const time = normalizeTime(pickupTime)
  const readyDate = new Date(`${pickupDate}T${time}`)

  const readyDateTimestamp = formatFedexFullDateTime(readyDate)
  const closeDate = addHours(readyDate, 2)
  const customerCloseTime = formatFedexTime(closeDate)

  return {
    associatedAccountNumber: { value: accountNumber() },
    originDetail: {
      pickupLocation: {
        contact: pickupContact,
        address: pickupAddress,
      },
      readyDateTimestamp,
      customerCloseTime,
      packageLocation,
    },
    trackingNumber,
    carrierCode,
  }
}

export function cancelPickupPayload({ confirmationCode, pickupDate, location }: CancelPickupInput) {
  return {
    associatedAccountNumber: { value: accountNumber() },
    pickupConfirmationCode: confirmationCode,
    scheduledDate: pickupDate,
    location,
  }
}

export function locationsPayload({ address, radiusMiles = 25, maxResults = 10 }: LocationsInput) {
  return {
    locationsSummaryRequestControlParameters: {
      distance: { units: 'MI', value: radiusMiles },
      maxResults,
    },
    constraints: {
      locationContentOptions: ['LOCATION_DROPOFF_TIMES'],
      excludeUnavailableLocations: true,
    },
    locationSearchCriterion: 'ADDRESS',
    location: { address },
    multipleMatchesAction: 'RETURN_ALL',
    sort: { criteria: 'DISTANCE', order: 'ASCENDING' },
    locationTypes: ['FEDEX_AUTHORIZED_SHIP_CENTER', 'FEDEX_OFFICE'],
  }
}

export function trackingPayload(trackingNumber: string) {
  return {
    includeDetailedScans: true,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  }
}
