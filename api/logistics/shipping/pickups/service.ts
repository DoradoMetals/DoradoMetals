import * as pickups from '#db/shipping/pickups/repo.ts'
import * as shipmentService from '#logistics/shipping/shipments/service.ts'
import type { ShipmentPickup, ShipmentPickupWrite } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function getAll(executor?: Executor): Promise<ShipmentPickup[]> {
  return await pickups.getAll(executor)
}

export async function getById(id: string, executor?: Executor): Promise<ShipmentPickup | null> {
  return (await pickups.getOne(id, executor)) ?? null
}

export async function getByOrder(order_id: string, executor?: Executor): Promise<ShipmentPickup[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor)
  if (!shipment) return []
  return await pickups.getByShipments([shipment.id], executor)
}

export async function recordForShipment(
  shipment_id: string,
  date: string,
  time: string,
  confirmation_number: string | number | null,
  location: string | null,
  executor?: Executor
): Promise<ShipmentPickup> {
  return await pickups.create(
    {
      shipment_id,
      requested_at: `${date} ${time || '00:00:00'}`,
      status: 'scheduled',
      confirmation_number: confirmation_number == null ? null : String(confirmation_number),
      location,
    },
    executor
  )
}

export async function update(
  id: string,
  patch: ShipmentPickupWrite,
  tx: Executor
): Promise<ShipmentPickup | null> {
  await pickups.update(id, patch, tx)
  return await getById(id, tx)
}
