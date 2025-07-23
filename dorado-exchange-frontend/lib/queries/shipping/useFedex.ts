import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useGetSession } from '../useAuth'
import { PurchaseOrder } from '@/types/purchase-order'

export const useFedExRates = (input: FedexRateInput | null) => {
  return useQuery({
    queryKey: ['fedexRates', input],
    queryFn: () => apiRequest<FedexRate[]>('POST', '/shipping/get_fedex_rates', input!),
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
    queryFn: () => apiRequest<FedexLocationsReturn>('POST', 'shipping/get_fedex_locations', input!),
    enabled: !!input,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export const useCancelFedExLabel = (order_id: string) => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { tracking_number: string; shipment_id: string }) => {
      return apiRequest('POST', '/shipping/cancel_fedex_label', payload)
    },
    onMutate: async () => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== order_id
            ? order
            : {
                ...order,
                shipment: {
                  ...order.shipment,
                  shipping_status: 'Cancelled',
                },
              }
        )
      )

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousOrders)
      }
    },

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}
