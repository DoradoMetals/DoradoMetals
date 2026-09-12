import * as endpoints from '#providers/fedex/endpoints.ts'
import * as payloads from '#providers/fedex/payloads.ts'
import {
  parseAddressValidation,
  parseLocations,
  parsePickupAvailability,
  parseRates,
  parseScheduledPickup,
  parseTracking,
  parseCreateShipment,
} from '#providers/fedex/utils/parsing.ts'
import {
  FEDEX_ADDRESS_VALIDATION_PATH,
  FEDEX_RATE_QUOTES_PATH,
  FEDEX_CREATE_SHIPMENT_PATH,
  FEDEX_CANCEL_SHIPMENT_PATH,
  FEDEX_PICKUP_AVAILABILITY_PATH,
  FEDEX_CREATE_PICKUP_PATH,
  FEDEX_CANCEL_PICKUP_PATH,
  FEDEX_LOCATIONS_PATH,
  FEDEX_TRACKING_PATH,
} from '#providers/fedex/constants.ts'

export async function validateAddress(address: Record<string, unknown> | null | undefined) {
  if (!address) {
    const err: Error & { statusCode?: number } = new Error('an address is required to validate one')
    err.statusCode = 400
    throw err
  }
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.validateAddressPayload(address)

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_ADDRESS_VALIDATION_PATH,
    payload,
  })

  return parseAddressValidation(data)
}

export async function getRates(input: any) {
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.rateQuotePayload(input)

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_RATE_QUOTES_PATH,
    payload,
  })

  return parseRates(data)
}

export async function createLabel(input: any) {
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.createShipmentPayload(input)

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_CREATE_SHIPMENT_PATH,
    payload,
  })

  return parseCreateShipment(data)
}

export async function cancelLabel({
  tracking_number,
}: {
  tracking_number: string | null | undefined
}) {
  if (!tracking_number) {
    const err: Error & { statusCode?: number } = new Error(
      'a tracking number is required to cancel a label'
    )
    err.statusCode = 400
    throw err
  }
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.cancelShipmentPayload(tracking_number)

  await endpoints.fedexPut({
    token,
    path: FEDEX_CANCEL_SHIPMENT_PATH,
    payload,
  })

  return { cancelled: true }
}

export async function checkPickup({
  pickupAddress,
  code,
  readyDate,
}: {
  pickupAddress: Record<string, unknown> | null | undefined
  code?: string
  readyDate: Date
}) {
  if (!pickupAddress) {
    const err: Error & { statusCode?: number } = new Error(
      'a pickup address is required to check availability'
    )
    err.statusCode = 400
    throw err
  }

  const token = await endpoints.fetchAccessToken()
  const payload = payloads.pickupAvailabilityPayload({
    pickupAddress,
    code,
    readyDate,
  })

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_PICKUP_AVAILABILITY_PATH,
    payload,
  })

  return parsePickupAvailability(data, readyDate)
}

export async function createPickup(input: any) {
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.schedulePickupPayload(input)

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_CREATE_PICKUP_PATH,
    payload,
  })

  return parseScheduledPickup(data)
}

export async function cancelPickup({
  confirmationCode,
  pickupDate,
  location,
}: {
  confirmationCode: string | number | null | undefined
  pickupDate?: unknown
  location?: unknown
}) {
  if (!confirmationCode) {
    const err: Error & { statusCode?: number } = new Error(
      'a confirmation code is required to cancel a pickup'
    )
    err.statusCode = 400
    throw err
  }
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.cancelPickupPayload({
    confirmationCode,
    pickupDate,
    location,
  })

  await endpoints.fedexPut({
    token,
    path: FEDEX_CANCEL_PICKUP_PATH,
    payload,
  })

  return { cancelled: true }
}

export async function getLocations({
  address,
  radiusMiles = 25,
  maxResults = 10,
}: {
  address: Record<string, unknown> | null | undefined
  radiusMiles?: number
  maxResults?: number
}) {
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      'an address is required to find locations near one'
    )
    err.statusCode = 400
    throw err
  }
  const token = await endpoints.fetchAccessToken()
  const payload = payloads.locationsPayload({
    address,
    radiusMiles,
    maxResults,
  })

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_LOCATIONS_PATH,
    payload,
  })

  return parseLocations(data)
}

export async function getTracking(input: any) {
  const token = await endpoints.fetchTrackingToken()
  const payload = payloads.trackingPayload(input.tracking_number)

  const data = await endpoints.fedexPost({
    token,
    path: FEDEX_TRACKING_PATH,
    payload,
  })

  return parseTracking(data)
}
