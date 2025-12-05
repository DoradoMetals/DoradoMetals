'use client'

import {
  FedexLocationsInput,
  FedexLocationsReturn,
  FedexPickupTimes,
  type FedexPickupTimesInput,
  type FedexRate,
  type FedexRateInput,
} from '@/types/fedex'
import { useApiQuery } from '../base'
import { queryKeys } from '../keyFactory'

export const useFedExRates = (input: FedexRateInput | null) =>
  useApiQuery<FedexRate[]>({
    key: queryKeys.fedexRates(input),
    method: 'POST',
    url: '/shipping/get_fedex_rates',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useFedExPickupTimes = (input: FedexPickupTimesInput | null) =>
  useApiQuery<FedexPickupTimes[]>({
    key: queryKeys.fedexPickupTimes(input),
    method: 'POST',
    url: 'shipping/check_fedex_pickup_times',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })

export const useFedExLocations = (input: FedexLocationsInput | null) =>
  useApiQuery<FedexLocationsReturn>({
    key: queryKeys.fedexLocations(input),
    method: 'POST',
    url: 'shipping/get_fedex_locations',
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
    body: () => input,
  })