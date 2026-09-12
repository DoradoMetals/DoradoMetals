'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Direction,
  FulfillmentCancelScheduleBody,
  FulfillmentCreateBody,
  FulfillmentMethodRead,
  FulfillmentPatchBody,
  FulfillmentScheduleDirectBody,
  FulfillmentSchedulePickupBody,
  FulfillmentSetMethodBody,
  FulfillmentSetStatusBody,
  FulfillmentView,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useOrderFulfillment(orderId: string, options: { enabled?: boolean } = {}) {
  return useQuery<FulfillmentView | null>({
    queryKey: keys.orders.fulfillment(orderId),
    enabled: (options.enabled ?? true) && orderId.length > 0,
    queryFn: () => apiRequest<FulfillmentView | null>('GET', `/orders/${orderId}/fulfillments`),
  })
}

export function useFulfillmentMethods(direction: Direction, options: { enabled?: boolean } = {}) {
  return useQuery<FulfillmentMethodRead[]>({
    queryKey: keys.fulfillments.methods(direction),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<FulfillmentMethodRead[]>('GET', '/fulfillments/methods', undefined, { direction }),
  })
}

function useFulfillmentWrite<TVariables, TResult>(
  orderId: string,
  run: (variables: TVariables) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.orders.fulfillment(orderId) })
      client.invalidateQueries({ queryKey: keys.orders.view(orderId) })
      client.invalidateQueries({ queryKey: keys.orders.documents(orderId) })
    },
  })
}

export function useCreateFulfillment(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentCreateBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments', body)
  )
}

export function useSetFulfillmentMethod(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentSetMethodBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments/set_method', body)
  )
}

export function useSetFulfillmentStatus(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentSetStatusBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments/set_status', body)
  )
}

export function useCancelSchedule(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentCancelScheduleBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments/cancel_schedule', body)
  )
}

export function useSchedulePickup(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentSchedulePickupBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments/schedule_pickup', body)
  )
}

export function useScheduleDirect(orderId: string) {
  return useFulfillmentWrite(orderId, (body: FulfillmentScheduleDirectBody) =>
    apiRequest<FulfillmentView>('POST', '/fulfillments/schedule_direct', body)
  )
}

export function usePatchFulfillment(orderId: string) {
  return useFulfillmentWrite(
    orderId,
    ({ fulfillment_id, choices }: { fulfillment_id: string; choices: FulfillmentPatchBody }) =>
      apiRequest<FulfillmentView>('PATCH', `/fulfillments/${fulfillment_id}`, choices)
  )
}
