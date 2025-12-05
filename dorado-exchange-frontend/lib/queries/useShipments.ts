import { ShipmentTracking, ShipmentTrackingInput } from '@/types/shipments'
import { useApiQuery } from '../base'
import { queryKeys } from '../keyFactory'

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
