import {
  ShipmentTracking,
  ShipmentTrackingInput,
  ShippingCancelLabelInput,
  ShippingCancelLabelResult,
  ShippingCancelPickupInput,
  ShippingCancelPickupResult,
  ShippingLocationsInput,
  ShippingLocationsReturn,
  ShippingPickupTimes,
  ShippingPickupTimesInput,
  ShippingRate,
  ShippingRatesInput,
  ShippingValidateAddressInput,
} from '@/features/shipping/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

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

export const useShippingRates = (input: ShippingRatesInput | null) =>
  useApiQuery<ShippingRate[]>({
    key: queryKeys.shippingRates(input ?? ({} as any)),
    method: 'POST',
    url: '/shipping/get_rates',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input!,
  })

export const useShippingPickupTimes = (input: ShippingPickupTimesInput) =>
  useApiQuery<ShippingPickupTimes[]>({
    key: queryKeys.shippingPickupTimes(input),
    method: 'POST',
    url: '/shipping/check_pickup',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingLocations = (input: ShippingLocationsInput) =>
  useApiQuery<ShippingLocationsReturn>({
    key: queryKeys.shippingLocations(input),
    method: 'POST',
    url: '/shipping/get_locations',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingValidateAddress = (input: ShippingValidateAddressInput) =>
  useApiQuery({
    key: queryKeys.shippingValidateAddress(input),
    method: 'POST',
    url: '/shipping/validate_address',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useShippingCancelLabel = () => {
  return useApiMutation<ShippingCancelLabelResult, ShippingCancelLabelInput>({
    queryKey: queryKeys.shippingCancelLabel(),
    url: '/shipping/cancel_label',
    method: 'POST',
    requireAdmin: true,
    body: input => input,
  }) 
}

export const useShippingCancelPickup = () => {
  return useApiMutation<ShippingCancelPickupResult, ShippingCancelPickupInput>({
    queryKey: queryKeys.shippingCancelPickup(),
    url: '/shipping/cancel_pickup',
    method: 'POST',
    requireAdmin: true,
    body: (input) => ({input}),
  })
}
