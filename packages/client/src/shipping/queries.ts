'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CarrierHandoff,
  CarrierServiceRead,
  PackageRead,
  ShipmentActualCostBody,
  ShipmentChargeBody,
  ShipmentPatch,
  ShipmentTrackingBody,
  ShipmentView,
  ShippingCancelLabelBody,
  TrackingScan,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useCarrierServices(options: { enabled?: boolean } = {}) {
  return useQuery<CarrierServiceRead[]>({
    queryKey: keys.shipping.services(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<CarrierServiceRead[]>('GET', '/carrier_services/offered'),
  })
}

export function usePackages(options: { enabled?: boolean } = {}) {
  return useQuery<PackageRead[]>({
    queryKey: keys.shipping.packages(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<PackageRead[]>('GET', '/shipping/packages'),
  })
}

export function useHandoffs(options: { enabled?: boolean } = {}) {
  return useQuery<CarrierHandoff[]>({
    queryKey: keys.shipping.handoffs(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<CarrierHandoff[]>('GET', '/shipping/handoffs'),
  })
}

export function useTracking(shipmentId: string, options: { enabled?: boolean } = {}) {
  return useQuery<TrackingScan[]>({
    queryKey: keys.shipping.tracking(shipmentId),
    enabled: (options.enabled ?? false) && shipmentId.length > 0,
    queryFn: () =>
      apiRequest<TrackingScan[]>('POST', '/shipping/get_tracking', { shipment_id: shipmentId }),
  })
}

function useShipmentWrite<TVariables, TResult>(
  orderId: string,
  run: (variables: TVariables) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.orders.shipments(orderId) })
      client.invalidateQueries({ queryKey: keys.orders.fulfillment(orderId) })
      client.invalidateQueries({ queryKey: keys.shipping.all() })
    },
  })
}

export function usePatchShipment(orderId: string) {
  return useShipmentWrite(
    orderId,
    ({ shipment_id, patch }: { shipment_id: string; patch: ShipmentPatch }) =>
      apiRequest<ShipmentView>('PATCH', `/shipments/${shipment_id}`, patch)
  )
}

export function useChargeShipment(orderId: string) {
  return useShipmentWrite(
    orderId,
    ({ shipment_id, ...body }: { shipment_id: string } & ShipmentChargeBody) =>
      apiRequest<ShipmentView>('POST', `/shipments/${shipment_id}/charge`, body)
  )
}

export function useRecordShipmentActualCost(orderId: string) {
  return useShipmentWrite(
    orderId,
    ({ shipment_id, ...body }: { shipment_id: string } & ShipmentActualCostBody) =>
      apiRequest<ShipmentView>('POST', `/shipments/${shipment_id}/actual_cost`, body)
  )
}

export function useRecordShipmentTracking(orderId: string) {
  return useShipmentWrite(
    orderId,
    ({ shipment_id, ...body }: { shipment_id: string } & ShipmentTrackingBody) =>
      apiRequest<ShipmentView>('POST', `/shipments/${shipment_id}/tracking`, body)
  )
}

export function useBuyLabel(orderId: string) {
  return useShipmentWrite(orderId, (shipment_id: string) =>
    apiRequest<ShipmentView>('POST', `/shipments/${shipment_id}/label`, {})
  )
}

export function useCancelLabel(orderId: string) {
  return useShipmentWrite(orderId, (body: ShippingCancelLabelBody) =>
    apiRequest<unknown>('POST', '/shipping/cancel_label', body)
  )
}
