"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Payout, PayoutDetails, PayoutPatch } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";
import { invalidateOrder } from "../orders/mutations";

export function usePatchPayout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ payout_id, patch }: {
      payout_id: string; order_id: string; patch: PayoutPatch;
    }) => apiRequest<Payout>("PATCH", `/payouts/${payout_id}`, patch),
    onSettled: (_row, _err, { order_id }) => invalidateOrder(client, order_id),
  });
}

export function usePayoutDetails(payout_id: string | null | undefined, enabled: boolean) {
  return useQuery<PayoutDetails>({
    queryKey: keys.payouts.details(payout_id ?? ""),
    enabled: enabled && !!payout_id,
    queryFn: () => apiRequest<PayoutDetails>("GET", `/payouts/${payout_id}/details`),
    staleTime: 0,
    gcTime: 0,
  });
}
