"use client";

// THE PAYOUT SURFACE. Two hooks: the payout's own writable facts, and the one
// read allowed to carry the bank numbers.
//
// THE ORDER'S PAYOUT IS AN ORDER READ - `useOrderPayouts` in ../orders, and
// `OrderView` carries the same row under `payout`. Both are LAST FOUR ONLY:
// routing and account numbers are not columns of those statements at all, so
// nothing on that path can leak one.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Payout, PayoutDetails, PayoutPatch } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";
import { invalidateOrder } from "../orders/mutations";

// PATCH /api/payouts/:id - the payout's charge and method, keyed by the
// payout's own id off the order wire (`order.payout.id`). ADMIN ONLY. Never
// the bank details: they have their own read below and no write surface at
// all.
//
// `waive_payout_fee` does NOT rewrite `cost` (D117) - a stored fee is a record
// of what the fee would have been; waiving sets a flag the server prices
// against, so un-waiving restores the number exactly. It reads back off the
// order wire as `order.totals.waive_payout_fee`.
//
// `order_id` is for the CACHE, not the URL: the payout renders inside order
// reads and its cost prices the quote, so the whole order settles through the
// one order cache policy.
export function usePatchPayout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ payout_id, patch }: {
      payout_id: string; order_id: string; patch: PayoutPatch;
    }) => apiRequest<Payout>("PATCH", `/payouts/${payout_id}`, patch),
    onSettled: (_row, _err, { order_id }) => invalidateOrder(client, order_id),
  });
}

// GET /api/payouts/:id/details - the FULL bank numbers, admin only, one payout
// at a time, for somebody about to execute a transfer.
//
// RADIOACTIVE, and the rules are the shape of this hook: deliberately absent
// from every order payload (an orders list would otherwise carry every
// customer's routing and account number), fetched on demand only, and NEVER
// held - staleTime 0 and gcTime 0 mean the numbers leave the cache the moment
// the screen showing them unmounts.
export function usePayoutDetails(payout_id: string | null | undefined, enabled: boolean) {
  return useQuery<PayoutDetails>({
    queryKey: keys.payouts.details(payout_id ?? ""),
    enabled: enabled && !!payout_id,
    queryFn: () => apiRequest<PayoutDetails>("GET", `/payouts/${payout_id}/details`),
    staleTime: 0,
    gcTime: 0,
  });
}
