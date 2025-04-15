import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import type {
  FedexLabelInput,
  FedexLabelResponse,
  FedexRate,
  FedexRateInput,
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
// const fedexRatesMutation = useFedExRates()

// const handleGetRates = () => {
//   const fedexAddress = formatFedExRatesAddress(address);
//   fedexRatesMutation.mutate(
//     {
//       shippingType: 'Inbound',
//       customerAddress: fedexAddress,
//       pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
//       packageDetails: {
//         weight: { units: 'LB', value: 2 },
//         dimensions: { length: 10, width: 6, height: 4, units: 'IN' },
//       },
//     },
//     {
//       onSuccess: (data) => {
//         console.log('FedEx Rates:', data)
//       },
//       onError: (err) => {
//         console.error('Rate fetch error:', err)
//       },
//     }
//   )
// }

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