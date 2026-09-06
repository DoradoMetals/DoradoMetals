import withTransaction from '#shared/db/withTransaction.ts'
import * as shipmentRepo from '#logistics/shipping/shipments/service.ts'
import * as trackingRepo from '#logistics/shipping/tracking/service.ts'
import * as shipmentView from '#logistics/shipping/shipments/view.ts'
import * as pickupRepo from '#logistics/shipping/pickups/service.ts'
import * as servicesRepo from '#db/shipping/services/repo.ts'
import * as addressesRepo from '#db/places/addresses/repo.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'
import * as checkoutService from '#checkout/service.ts'
import * as pricing from '#pricing/index.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import * as carrierServices from '#logistics/shipping/services/service.ts'
import * as shippingRules from '#logistics/shipping/rules.ts'
import * as handoffsService from '#logistics/shipping/handoffs/service.ts'
import * as shippingHandler from '#logistics/shipping/operations/handler.ts'
import * as emails from '#documents/emails/service.ts'
import { carrierIdOr } from '#logistics/shipping/operations/resolver.ts'
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from '#providers/shipments/constants.ts'
import { attempt } from '#shared/attempt.ts'
import type { OrderViewShipment as ShipmentRow } from '@dorado/contracts'
import type { ParsedTracking } from '#providers/shipments/utils/parsing.ts'
type RatesInput = Parameters<typeof shippingHandler.getRates>[2]
import type { ShipmentPickup } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  CarrierLabel,
  CheckoutRate,
  Direction,
  Shipment,
  ShipmentView,
  ShippingCancelLabelBody,
  ShippingCancelPickupBody,
  ShippingCheckPickupBody,
  ShippingGetLocationsBody,
  ShippingValidateAddressBody,
} from '@dorado/contracts'

async function requireAddress(address_id: string) {
  const address = await addressesRepo.getOne(address_id)
  shippingRules.assertAddress(address, address_id)
  return address
}

export async function cancelLabel({
  shipment_id,
  carrier_id,
}: ShippingCancelLabelBody): Promise<ShipmentRow | null> {
  const shipment = await shipmentRepo.getById(shipment_id)
  shippingRules.assertShipment(shipment, shipment_id)

  await shippingHandler.cancelLabel(await carrierIdOr(carrier_id), undefined, {
    trackingNumber: shipment.tracking_number,
  })

  return await withTransaction((tx) =>
    shipmentRepo.update(shipment.id, { shipping_status: 'Cancelled' }, tx)
  )
}

export async function getTracking(
  shipment_id: string,
  isAdmin: boolean,
  fetchTracking?: (shipment: ShipmentRow, client?: Executor) => Promise<ParsedTracking>
): Promise<ShipmentView | null> {
  const view = await refreshTracking(shipment_id, isAdmin, fetchTracking)
  // The mailers go out AFTER the scan rows are committed. An email cannot be
  // rolled back, and both of these are gated by their own SQL read - one waits
  // for a scan that is not 'Label Created', the other for a delivered parcel -
  // so calling them on every refresh is correct and the trail makes each once.
  await notifyOnScan(shipment_id)
  return view
}

async function notifyOnScan(shipment_id: string): Promise<void> {
  const link = await shipmentRepo.getOrderLink(shipment_id)
  if (!link?.order_id) return
  await emails.sendShipmentSent(link.order_id)
  await emails.sendShipmentReceived(link.order_id)
}

async function refreshTracking(
  shipment_id: string,
  isAdmin: boolean,
  fetchTracking?: (shipment: ShipmentRow, client?: Executor) => Promise<ParsedTracking>
): Promise<ShipmentView | null> {
  return withTransaction(async (client) => {
    const shipment = await shipmentRepo.getById(shipment_id, client)
    shippingRules.assertShipment(shipment, shipment_id)

    const service = shipment.carrier_service_id
      ? await servicesRepo.getOne(shipment.carrier_service_id, client)
      : undefined

    const carrier_id = service?.carrier_id ?? null
    let trackingInfo: ParsedTracking
    if (fetchTracking) {
      trackingInfo = await fetchTracking(shipment, client)
    } else {
      shippingRules.assertCarrier(carrier_id, shipment_id)
      trackingInfo = await shippingHandler.getTracking(carrier_id, client, {
        tracking_number: shipment.tracking_number,
      })
    }

    if (!trackingInfo.scanEvents?.length) {
      return await shipmentView.getById(shipment_id, isAdmin, client)
    }

    await trackingRepo.removeEvents(shipment_id, client)
    await trackingRepo.insertEvents(trackingInfo, shipment_id, client)

    await shipmentRepo.update(
      shipment_id,
      {
        shipping_status: trackingInfo.latestStatus ?? shipment.shipping_status,
        est_delivery:
          trackingInfo.estimatedDeliveryTime === 'TBD' ? null : trackingInfo.estimatedDeliveryTime,
        delivered_at: trackingInfo.deliveredAt,
      },
      client
    )

    return await shipmentView.getById(shipment_id, isAdmin, client)
  })
}

export async function quoteRate(
  carrier_id: string | null,
  shippingType: unknown,
  address: RatesInput['shipperAddress'],
  pkg: RatesInput['pkg'],
  pickupType: RatesInput['pickupType'],
  declaredValue: RatesInput['declaredValue']
): Promise<ReturnType<typeof shippingHandler.getRates>> {
  shippingRules.assertShippingType(shippingType)
  const inbound = shippingType === 'Inbound'
  const shipperAddress: RatesInput['shipperAddress'] = inbound ? address : DORADO_ADDRESS
  const recipientAddress: RatesInput['recipientAddress'] = inbound ? FEDEX_STORE_ADDRESS : address

  return shippingHandler.getRates(await carrierIdOr(carrier_id), undefined, {
    shipperAddress,
    recipientAddress,
    pkg,
    pickupType,
    declaredValue,
  })
}

export async function getFulfillmentRates(fulfillment_id: string): Promise<CheckoutRate[]> {
  const view = await fulfillmentService.getById(fulfillment_id)
  shippingRules.assertRatableFulfillment(view, fulfillment_id)
  const parcel = view.parcel
  shippingRules.assertRatableParcel(parcel, fulfillment_id)

  const checkout = await checkoutService.ownerOfFulfillment(fulfillment_id)
  shippingRules.assertRatableCheckout(checkout, fulfillment_id)
  const cart = await checkoutService.getItemsForOrder(checkout.id)
  shippingRules.assertRatableCart(cart.length)

  shippingRules.assertPackageChosen(parcel.package_id)
  const box = await packagesRepo.getOne(parcel.package_id)
  shippingRules.assertPackage(box, parcel.package_id)
  const weight = shippingRules.parcelWeightLb(cart, box)

  const inbound = parcel.direction === 'Inbound'
  const address_id = inbound ? parcel.shipper_address_id : parcel.recipient_address_id
  shippingRules.assertAddressChosen(address_id)
  const address = await requireAddress(address_id)

  const quote = await pricing.priceCheckout(checkout.id)
  const total = inbound && quote.direction === 'purchase' ? quote.total : 0
  const declaredValue = await carrierServices.clampInsuredValue(shippingRules.declaredValue(total))

  // The same handoff the label will be bought with. Quoting with no pickupType
  // and buying with `parcel.handoff.code` asked FedEx two different questions,
  // and the second answer is what is deducted from the payout (LD F6).
  const handoff = shippingRules.handoffFor(await handoffsService.getHandoffs(), view.method.type)

  const quoted = await quoteRate(
    null,
    inbound ? 'Inbound' : 'Outbound',
    address,
    {
      weight: { units: 'LB', value: weight },
      dimensions: {
        length: Number(box.length),
        width: Number(box.width),
        height: Number(box.height),
        units: 'IN',
      },
    },
    handoff.code,
    declaredValue > 0 ? { amount: declaredValue, currency: 'USD' } : undefined
  )

  return shippingRules.offeredRates(
    quoted,
    await carrierServices.getOfferedServices(null),
    parcel.carrier_service_id
  )
}

export async function validateAddress(
  body: ShippingValidateAddressBody
): Promise<ReturnType<typeof shippingHandler.validateAddress>> {
  const address = await requireAddress(body.address_id)
  return shippingHandler.validateAddress(await carrierIdOr(body.carrier_id), undefined, { address })
}

export async function checkPickup(
  body: ShippingCheckPickupBody
): Promise<ReturnType<typeof shippingHandler.checkPickup>> {
  const address = await requireAddress(body.address_id)
  const readyAt = new Date(body.readyDate)
  shippingRules.assertReadyDate(readyAt)
  return shippingHandler.checkPickup(await carrierIdOr(body.carrier_id), undefined, {
    pickupAddress: address,
    code: body.code,
    readyDate: readyAt,
  })
}

export async function getLocations(
  body: ShippingGetLocationsBody
): Promise<ReturnType<typeof shippingHandler.getLocations>> {
  const address = await requireAddress(body.address_id)
  return shippingHandler.getLocations(await carrierIdOr(body.carrier_id), undefined, {
    address,
    radiusMiles: body.radius_miles,
    maxResults: body.max_results,
  })
}

export async function cancelPickup({
  pickup_id,
  carrier_id,
}: ShippingCancelPickupBody): Promise<ShipmentPickup | null> {
  const pickup = await pickupRepo.getById(pickup_id)
  shippingRules.assertPickup(pickup, pickup_id)

  const requestedAt = pickup.requested_at as Date | string | null
  const parcel = pickup.shipment_id ? await shipmentRepo.getById(pickup.shipment_id) : null
  const pickupDate = shippingRules.pickupDateFor(parcel?.pickup_date, requestedAt)

  await shippingHandler.cancelPickup(await carrierIdOr(carrier_id), undefined, {
    confirmationCode:
      pickup.confirmation_number === null ? null : String(pickup.confirmation_number),
    pickupDate,
    location: pickup.location,
  })

  return await withTransaction((tx) =>
    pickupRepo.update(
      pickup.id,
      {
        requested_at: requestedAt,
        status: 'canceled',
        confirmation_number: pickup.confirmation_number,
        location: pickup.location,
      },
      tx
    )
  )
}

export async function voidLabel(trackingNumber: string | undefined | null): Promise<void> {
  if (!trackingNumber) return
  await attempt(`ORPHANED SHIPPING LABEL ${trackingNumber}`, async () =>
    shippingHandler.cancelLabel(await carrierIdOr(null), undefined, { trackingNumber })
  )
}

export async function labelBufferOrVoid(
  labelData: CarrierLabel,
  cancel: typeof voidLabel = voidLabel
): Promise<Buffer> {
  if (!labelData.labelFile) await cancel(labelData.tracking_number)
  shippingRules.assertLabelFile(labelData.labelFile)
  return Buffer.from(labelData.labelFile, 'base64')
}
