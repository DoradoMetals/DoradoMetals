import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import {
  FedexCancelPickupInput,
  FedexLocationsInput,
  FedexLocationsReturn,
  FedexPickup,
  FedexPickupInput,
  FedexPickupTimes,
  type FedexLabelInput,
  type FedexLabelResponse,
  type FedexPickupTimesInput,
  type FedexRate,
  type FedexRateInput,
} from '@/types/shipping'

export const useFedExRates = (input: FedexRateInput | null) => {
  return useQuery({
    queryKey: ['fedexRates', input],
    queryFn: () =>
      apiRequest<FedexRate[]>('POST', '/shipping/get_fedex_rates', input!),
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export const useFedExLabel = () => {
  return useMutation({
    mutationFn: (input: FedexLabelInput) =>
      apiRequest<FedexLabelResponse>('POST', '/shipping/create_fedex_label', input),
  })
}

export const useFedExPickupTimes = (input: FedexPickupTimesInput | null) => {
  return useQuery({
    queryKey: ['fedexPickupTimes', input],
    queryFn: () =>
      apiRequest<FedexPickupTimes[]>('POST', 'shipping/check_fedex_pickup_times', input!),
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export const useFedExPickup = () => {
  return useMutation({
    mutationFn: (input: FedexPickupInput) =>
      apiRequest<FedexPickup>('POST', '/shipping/schedule_fedex_pickup', input),
  })
}

export const useCancelFedExPickup = () => {
  return useMutation({
    mutationFn: (input: FedexCancelPickupInput) =>
      apiRequest<FedexPickup>('POST', '/shipping/cancel_fedex_pickup', input),
  })
}

export const useFedExLocations = (input: FedexLocationsInput | null) => {
  return useQuery({
    queryKey: ['fedexLocations', input],
    queryFn: () =>
      apiRequest<FedexLocationsReturn>('POST', 'shipping/get_fedex_locations', input!),
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export const useCancelFedExLabel = () => {
  return useMutation({

    mutationFn: (payload: { tracking_number: string; shipment_id: string }) =>
      apiRequest('POST', '/shipping/cancel_fedex_label', payload),
  });
};