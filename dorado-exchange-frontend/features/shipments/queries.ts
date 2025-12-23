import { ShipmentTracking, ShipmentTrackingInput } from '@/features/shipments/types'
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'

export const useTracking = (input: ShipmentTrackingInput) => {
  return useApiQuery<ShipmentTracking | null>({
    key: queryKeys.shipmentTracking(input),
    url: '/shipping/get_tracking',
    method: 'POST',
    requireUser: true,
    enabled: (user) =>
      !!user?.id && !!input.shipment_id && !!input.tracking_number && !!input.carrier_id,
    body: () => ({
      tracking_number: input.tracking_number,
      shipment_id: input.shipment_id,
      carrier_id: input.carrier_id,
    }),
  })
}
