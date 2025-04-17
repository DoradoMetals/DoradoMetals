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
    enabled: !!input, // only runs when input is provided
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}

export const useFedExLabel = () => {
  return useMutation({
    mutationFn: (input: FedexLabelInput) =>
      apiRequest<FedexLabelResponse>('POST', '/shipping/create_fedex_label', input),
  })
}
// const fedexLabelMutation = useFedExLabel()

// const handleGenerateLabel = () => {
//   fedexLabelMutation.mutate(
//     {
//       order_id: '139841bb-ce78-45c3-8c17-04cf5d0d6c49',
//       customerName: address.name,
//       customerPhone: address.phone_number,
//       customerAddress: formatFedexLabelAddress(address),
//       shippingType: 'Inbound',
//       pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
//       serviceType: 'FEDEX_GROUND',
//       packageDetails: {
//         sequenceNumber: 1,
//         weight: { units: 'LB', value: 2 },
//         dimensions: { length: 10, width: 6, height: 4, units: 'IN' },
//       },
//     },
//     {
//       onSuccess: (data) => {
//         console.log('Label generated:', data)
//       },
//       onError: (err) => {
//         console.error('Label error:', err)
//       },
//     }
//   )
// }


export const useFedExPickupTimes = (input: FedexPickupTimesInput | null) => {
  return useQuery({
    queryKey: ['fedexPickupTimes', input],
    queryFn: () =>
      apiRequest<FedexPickupTimes[]>('POST', 'shipping/check_fedex_pickup_times', input!),
    enabled: !!input, // only runs when input is provided
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}

export const useFedExPickup = () => {
  return useMutation({
    mutationFn: (input: FedexPickupInput) =>
      apiRequest<FedexPickup>('POST', '/shipping/schedule_fedex_pickup', input),
  })
}

  // const fedexPickupMutation = useFedExPickup()


  // const handleSchedulePickup = () => {
  //   if (!address || !service || !pickup || !pickup.time || !pickup.date) return
  
  //   fedexPickupMutation.mutate(
  //     {
  //       customerName: address.name,
  //       customerPhone: address.phone_number,
  //       customerAddress: formatFedexPickupAddress(address),
  //       pickupDate: pickup.date,
  //       pickupTime: pickup.time,
  //       code: service.code,
  //     },
  //     {
  //       onSuccess: (data) => {
  //         console.log('✅ Pickup scheduled:', data)
  //       },
  //       onError: (err) => {
  //         console.error('❌ Pickup error:', err)
  //       },
  //     }
  //   )
  // }

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
