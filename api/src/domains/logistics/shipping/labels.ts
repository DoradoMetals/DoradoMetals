import * as shipmentsRepo from '#db/shipping/shipments/repo.ts'
import * as packagesRepo from '#db/shipping/packages/repo.ts'
import * as orderAddresses from '#db/orders/addresses/repo.ts'
import * as placeAddresses from '#db/places/addresses/repo.ts'
import * as locationsRepo from '#db/places/locations/repo.ts'
import * as lotsRepo from '#db/lots/items/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as orderTransactions from '#db/orders/transactions/repo.ts'
import * as usersRepo from '#db/users/repo.ts'

import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import * as pickupService from '#logistics/shipping/pickups/service.ts'
import * as carrierServices from '#logistics/shipping/services/service.ts'
import * as handoffsService from '#logistics/shipping/handoffs/service.ts'
import * as fulfillmentPickups from '#logistics/fulfillments/pickups/service.ts'
import * as shippingOps from '#logistics/shipping/operations/handler.ts'
import * as shippingOperations from '#logistics/shipping/operations/service.ts'
import * as rules from '#logistics/shipping/rules.ts'
import * as requests from '#providers/fedex/requests.ts'
import * as checkoutService from '#checkout/service.ts'
import * as pricing from '#pricing/index.ts'

import withTransaction from '#shared/db/withTransaction.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  Address,
  CarrierPickupBooking,
  HoldAtLocation,
  Parcel,
  ParcelSchedule,
} from '@dorado/contracts'

export async function sealForPlacement(
  shipment_id: string,
  checkout_id: string,
  method_type: string | null,
  tx: Executor
): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id, tx)
  rules.assertShipment(shipment, shipment_id)
  rules.assertParcelChosen(shipment, shipment_id)

  const service = await carrierServices.labelServiceFor(shipment.carrier_service_id!, tx)
  const quote = await pricing.priceCheckout(checkout_id, tx)
  const declaredValue = await carrierServices.clampInsuredValue(
    rules.declaredValue(quote.direction === 'purchase' ? quote.total : 0),
    service.code
  )
  const handoff = rules.handoffFor(await handoffsService.getHandoffs(), method_type)
  rules.parcelFor(
    service,
    await packagesRepo.getOne(shipment.package_id!, tx),
    handoff,
    declaredValue,
    rules.parcelWeightLb(
      await checkoutService.lotsFor(checkout_id, tx),
      await packagesRepo.getOne(shipment.package_id!, tx)
    ),
    rules.scheduleOf(shipment.pickup_date, shipment.pickup_time)
  )

  await shipmentsRepo.update(
    shipment_id,
    {
      pickup_type: handoff.name,
      insured: declaredValue > 0,
      declared_value: declaredValue > 0 ? declaredValue : null,
    },
    tx
  )
}

async function lotsOf(order_id: string) {
  return await lotsRepo.getByIds((await orderLots.getFor(order_id)).map((row) => row.lot_id))
}

export async function buyLabel(shipment_id: string): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id)
  rules.assertShipment(shipment, shipment_id)
  rules.assertUnlabelled(shipment.tracking_number, shipment_id)
  rules.assertParcelChosen(shipment, shipment_id)
  await claim(shipment_id)

  const link = await shipmentService.getOrderLink(shipment_id)
  rules.assertLabelledOrder(link, shipment_id)
  const { order_id } = link

  const handoff = (await handoffsService.getHandoffs()).find((h) => h.name === shipment.pickup_type)
  rules.assertHandoff(handoff, shipment_id)

  const parcel = rules.parcelFor(
    await carrierServices.labelServiceFor(shipment.carrier_service_id!),
    await packagesRepo.getOne(shipment.package_id!),
    handoff,
    shipment.declared_value ?? 0,
    rules.parcelWeightLb(await lotsOf(order_id), await boxOf(shipment.package_id)),
    rules.scheduleOf(shipment.pickup_date, shipment.pickup_time) ??
      rules.scheduleFromPickup((await fulfillmentPickups.forOrder(order_id))[0])
  )

  const shipper = await snapshotOf(order_id, shipment_id)
  const personName = await customerName(order_id)

  const netCharge = rules.quotedCharge(
    await shippingOperations.quoteRate(
      parcel.carrier_id,
      'Inbound',
      shipper,
      requests.rateParcel(parcel).pkg,
      requests.rateParcel(parcel).pickupType,
      requests.rateParcel(parcel).declaredValue
    ),
    parcel.serviceType
  )
  const labelData = await shippingOps.createLabel(
    parcel.carrier_id,
    undefined,
    requests.inboundLabelRequest(shipper, personName, parcel, await holdLocation())
  )
  const label = await shippingOperations.labelBufferOrVoid(labelData)
  const booking = parcel.schedule
    ? await shippingOps.createPickup(
        parcel.carrier_id,
        undefined,
        requests.pickupRequest(
          shipper,
          personName,
          parcel,
          parcel.schedule,
          labelData.tracking_number
        )
      )
    : null

  await record(
    order_id,
    shipment_id,
    netCharge,
    parcel.serviceType,
    labelData.tracking_number,
    label,
    parcel.schedule,
    booking
  )
}

export async function buyReturnLabel(shipment_id: string): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id)
  rules.assertShipment(shipment, shipment_id)
  rules.assertUnlabelled(shipment.tracking_number, shipment_id)
  rules.assertParcelChosen(shipment, shipment_id)
  await claim(shipment_id)

  const link = await shipmentService.getOrderLink(shipment_id)
  rules.assertLabelledOrder(link, shipment_id)
  const { order_id } = link

  const service = await carrierServices.labelServiceFor(shipment.carrier_service_id!)
  const parcel = rules.parcelFor(
    service,
    await packagesRepo.getOne(shipment.package_id!),
    rules.handoffFor(await handoffsService.getHandoffs(), null),
    shipment.declared_value ?? 0,
    rules.parcelWeightLb(await lotsOf(order_id), await boxOf(shipment.package_id)),
    null
  )

  const labelData = await shippingOps.createLabel(
    parcel.carrier_id,
    undefined,
    requests.returnLabelRequest(
      await customerName(order_id),
      await snapshotOf(order_id, shipment_id),
      parcel,
      await holdLocation()
    )
  )
  const label = await shippingOperations.labelBufferOrVoid(labelData)

  await withTransaction((tx) =>
    shipmentService.update(
      shipment_id,
      {
        tracking_number: labelData.tracking_number,
        label,
        label_type: 'Generated',
        shipping_status: 'Label Created',
      },
      tx
    )
  )
}

async function claim(shipment_id: string): Promise<void> {
  const claimed = await withTransaction((tx) => shipmentsRepo.claimForLabel(shipment_id, tx))
  rules.assertClaimed(claimed, shipment_id)
}

export async function returnDeclaredValue(
  order_id: string,
  order_total: number | null,
  service_code: string,
  executor?: Executor
): Promise<number> {
  const inbound = await shipmentService.getByOrder(order_id, executor)
  return await carrierServices.clampInsuredValue(
    rules.returnDeclaredValue(inbound?.declared_value, order_total),
    service_code
  )
}

async function record(
  order_id: string,
  shipment_id: string,
  netCharge: number,
  service: string,
  tracking_number: string | null,
  label: Uint8Array,
  schedule: ParcelSchedule | null,
  booking: CarrierPickupBooking | null
): Promise<void> {
  await withTransaction(async (tx) => {
    await orderTransactions.update(
      order_id,
      { shipping: netCharge, shipping_service: service },
      {},
      tx
    )
    await shipmentService.update(
      shipment_id,
      {
        tracking_number,
        label,
        label_type: 'Generated',
        shipping_status: 'Label Created',
        cost: netCharge,
      },
      tx
    )
    if (booking && schedule) {
      await pickupService.recordForShipment(
        shipment_id,
        schedule.date,
        schedule.time,
        booking.confirmationNumber,
        booking.location,
        tx
      )
    }
  })
}

async function holdLocation(): Promise<HoldAtLocation> {
  const hold = await locationsRepo.defaultReturn()
  rules.assertReturnLocation(hold)
  return hold
}

async function boxOf(package_id: string | null) {
  return package_id === null ? undefined : await packagesRepo.getOne(package_id)
}

async function snapshotOf(order_id: string, shipment_id: string): Promise<Address> {
  const link = await orderAddresses.getFor(order_id)
  const address = link ? await placeAddresses.getOne(link.address_id) : undefined
  rules.assertAddress(address, `snapshot for shipment ${shipment_id}`)
  return address
}

async function customerName(order_id: string): Promise<string> {
  const user_id = await ordersRepo.ownerOf(order_id)
  if (!user_id) return ''
  return (await usersRepo.getOne(user_id))?.name ?? ''
}
