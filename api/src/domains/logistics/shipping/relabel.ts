import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import * as labels from '#logistics/shipping/labels.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { OrderViewShipment } from '@dorado/contracts'

const parcels = (shipments: OrderViewShipment[]) =>
  shipments.filter((s) => s.direction === 'Inbound' || s.direction === 'Outbound')

export function inMotion(shipments: OrderViewShipment[]): boolean {
  return parcels(shipments).some((s) => s.shipped_at !== null || s.delivered_at !== null)
}

export async function retarget(
  shipments: OrderViewShipment[],
  address_id: string,
  tx: Executor
): Promise<void> {
  for (const s of parcels(shipments)) {
    await shipmentService.update(
      s.id,
      s.direction === 'Outbound'
        ? { recipient_address_id: address_id }
        : { shipper_address_id: address_id },
      tx
    )
  }
}

export async function relabel(
  shipments: OrderViewShipment[],
  cancel = labels.voidTracking,
  buyInbound = labels.buyLabel,
  buyOutbound = labels.buyOutboundLabel
): Promise<void> {
  for (const s of parcels(shipments).filter((row) => row.tracking_number !== null)) {
    const voided = await attempt(`void label ${s.tracking_number}`, () =>
      cancel(s.tracking_number!)
    )
    if (!voided) continue
    const cleared = await attempt(`clear label on shipment ${s.id}`, () =>
      withTransaction((tx) =>
        shipmentService.update(
          s.id,
          { tracking_number: null, label: null, label_type: null, shipping_status: 'Cancelled' },
          tx
        )
      )
    )
    if (!cleared) continue
    await attempt(`relabel shipment ${s.id}`, () =>
      (s.direction === 'Inbound' ? buyInbound : buyOutbound)(s.id)
    )
  }
}
