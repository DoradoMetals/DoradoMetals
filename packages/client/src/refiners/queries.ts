"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  RefinerItem, RefinerItemPatch, RefinerOrder, RefinerOrderPatch, RefinerRead, RefinerSpot,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";
import { invalidateOrder } from "../orders/mutations";

export function useAdminSuppliers(options: { enabled?: boolean } = {}) {
  return useQuery<RefinerRead[]>({
    queryKey: keys.refiners.suppliers(),
    queryFn: () => apiRequest<RefinerRead[]>("GET", "/suppliers/get_all"),
    enabled: options.enabled ?? true,
  });
}

export function useRefinerOrder(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerOrder>({
    queryKey: keys.refiners.order(order_id),
    queryFn: () => apiRequest<RefinerOrder>("GET", `/orders/${order_id}/refiners`),
    enabled: (options.enabled ?? true) && !!order_id,
  });
}

export function useRefinerMetals(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerSpot[]>({
    queryKey: keys.refiners.metals(order_id),
    queryFn: () => apiRequest<RefinerSpot[]>("GET", `/orders/${order_id}/refiners/spots`),
    enabled: (options.enabled ?? true) && !!order_id,
    refetchInterval: 60_000,
  });
}

export function useRefinerItems(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerItem[]>({
    queryKey: keys.refiners.items(order_id),
    queryFn: () => apiRequest<RefinerItem[]>("GET", `/orders/${order_id}/refiners/items`),
    enabled: (options.enabled ?? true) && !!order_id,
  });
}

type PatchRefinerItemVars = {
  order_item_id: string;
  order_id: string;
  patch: RefinerItemPatch;
};

export function usePatchRefinerItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ order_item_id, patch }: PatchRefinerItemVars) =>
      apiRequest<unknown>("PATCH", `/refiners/items/by-order-item/${order_item_id}`, patch),
    onSettled: (_data, _err, { order_id }) => {
      invalidateOrder(queryClient, order_id);
    },
  });
}

type PatchRefinerOrderVars = {
  refiner_order_id: string;
  order_id: string;
  patch: RefinerOrderPatch;
};

export function usePatchRefinerOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ refiner_order_id, patch }: PatchRefinerOrderVars) =>
      apiRequest<unknown>("PATCH", `/refiners/orders/${refiner_order_id}`, patch),
    onSettled: (_data, _err, { order_id }) => {
      invalidateOrder(queryClient, order_id);
    },
  });
}
