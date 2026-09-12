import * as tracking from '#db/shipping/tracking/repo.ts'
import type { ParsedTracking, TrackingEvent } from '#providers/fedex/utils/parsing.ts'
import type { Executor } from '#shared/db/executor.ts'

export async function removeEvents(shipment_id: string, tx: Executor): Promise<boolean> {
  await tracking.remove(shipment_id, tx)
  return true
}

export async function insertEvents(
  trackingInfo: Pick<ParsedTracking, 'scanEvents'> | null | undefined,
  shipment_id: string,
  tx: Executor
): Promise<number> {
  const events: TrackingEvent[] = trackingInfo?.scanEvents ?? []
  if (!events.length) return 0

  return await tracking.insert(events, shipment_id, tx)
}
