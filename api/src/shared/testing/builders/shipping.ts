import type { PoolClient } from 'pg'
import * as shipments from '#db/shipping/shipments/repo.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import * as fulfillmentShipments from '#db/fulfillments/shipments/repo.ts'
import {
  carrierServiceId,
  packageId,
  fulfillmentMethodId,
  shipmentDirection,
} from '#shared/testing/builders/reference.ts'
import type { BuiltOrder } from '#shared/testing/builders/orders.ts'

export type BuiltShipment = {
  id: string
  order_id: string
  fulfillment_id: string
  tracking_number: string
  carrier_service_id: string
  package_id: string
}

export type ShipmentOptions = {
  tracking_number?: string
  shipping_status?: string | null
  method?: string
  fulfillment_status?: string
  cost?: number | null
  insured?: boolean | null
  declared_value?: number | null
  label?: string | null
  label_type?: string | null
  pickup_type?: string | null
}

export async function aShipment(
  c: PoolClient,
  order: BuiltOrder | { id: string; direction: 'purchase' | 'sale' },
  options: ShipmentOptions = {}
): Promise<BuiltShipment> {
  const carrier_service_id = await carrierServiceId(c)
  const package_id = await packageId(c)
  const id = await shipments.create(
    {
      direction: shipmentDirection(order.direction),
      shipping_status: options.shipping_status ?? 'Label Created',
      label: options.label ?? null,
      label_type: options.label_type ?? null,
      pickup_type: options.pickup_type ?? null,
      package_id,
      carrier_service_id,
      cost: options.cost ?? 24.5,
      insured: options.insured ?? true,
      declared_value: options.declared_value ?? 2500,
    },
    c
  )

  // The number comes from the id the DATABASE minted, so two shipments built in
  // one test can never collide on 136's unique index. `aTag()` was truncated to
  // fit twelve characters and dropped the digit that made it unique.
  const tracking_number = options.tracking_number ?? `7941${id.replace(/-/g, '').slice(0, 8)}`
  await shipments.update(id, { tracking_number }, c)

  const method_id = await fulfillmentMethodId(
    c,
    options.method ?? 'CARRIER DROPOFF',
    order.direction
  )
  const fulfillment = await fulfillments.create(
    order.id,
    method_id,
    options.fulfillment_status ?? 'PENDING',
    c
  )
  const fulfillment_id = fulfillment!.id
  await fulfillmentShipments.create({ fulfillment_id, shipment_id: id }, c)

  return { id, order_id: order.id, fulfillment_id, tracking_number, carrier_service_id, package_id }
}
