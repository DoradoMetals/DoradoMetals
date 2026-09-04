"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  RefinerItem, RefinerItemPatch, RefinerOrder, RefinerOrderPatch, RefinerRead, RefinerSpot,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";
import { invalidateOrder } from "../orders/mutations";

// REFINERS IS ITS OWN FEATURE, and the endpoint follows the feature that
// owns the table (Jacob's rule, fourth D87 correction). The standing rule of
// the fifth: ENGAGEMENT FACTS LIVE ON refiners.orders - the refiner-side
// engagement attached to a customer order owns the refiner spots, the fee,
// and the pool figures, addressed by the order wire's refiner_order_id. Per-
// line refiner data (premium + assay) lives on refiners.items. The order
// PATCH keeps only what orders own; the order READ still serves the pool and
// fee figures unchanged this series, so displays are untouched.
//
// KEYING (Jacob's route convention): READS RESOLVE FROM THE PARENT PATH -
// GET /orders/:orderId/refiners and /orders/:orderId/refiners/spots take the
// customer order's id, the key components actually hold; the order wire
// deliberately does not carry the engagement's id (the join product stays
// off the order document). WRITES KEY BY THE RESOURCE'S OWN ID - the
// engagement PATCH takes the engagement row's id, which the read supplies.
// /refiners/items/by-order-item/:orderItemId takes the ORDER ITEM's id, and
// the path says so - the order wire serves refiner values by order line and
// never exposes refiners.items' own row id, so the line's id is the only key
// the client honestly holds.
//
// ADMIN-ONLY SURFACE: every read below is gated by an `enabled` flag the
// CALLER passes in (the admin screen knows whether there's a session; this
// package does not import auth state directly - see packages/client/src/
// users/queries.ts for the same pattern).
//
// URLS ARE UNCHANGED from the pre-relocation frontend/features/refiners/
// queries.ts on purpose - /api/suppliers keeps its historical spelling
// (api/app.ts's own comment: "the frontend calls it directly"), and the rest
// are already correctly REST-shaped and partly owned by the orders route
// files. Moving this file is a relocation, not a rename.

// EVERY REFINER, for the admin pickers that name one. It lived in
// features/products/queries.ts because the product form has a supplier
// dropdown; the endpoint belongs to the feature that owns the table.
export function useAdminSuppliers(options: { enabled?: boolean } = {}) {
  return useQuery<RefinerRead[]>({
    queryKey: keys.refiners.suppliers(),
    queryFn: () => apiRequest<RefinerRead[]>("GET", "/suppliers/get_all"),
    enabled: options.enabled ?? true,
  });
}

// The bare engagement row for one customer order, VERBATIM (the
// RefinerOrder contract re-exports refiners.orders' generated row). Its `id`
// is the key usePatchRefinerOrder needs.
export function useRefinerOrder(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerOrder>({
    queryKey: keys.refiners.order(order_id),
    queryFn: () => apiRequest<RefinerOrder>("GET", `/orders/${order_id}/refiners`),
    enabled: (options.enabled ?? true) && !!order_id,
  });
}

// The refinery's quoted spots for the order's engagement - VERBATIM
// refiners.spots rows; the metal is its id, and a display name is mapped
// client-side from the spots reference read. Named for the RESOURCE - this
// replaced usePurchaseOrderRefinerMetals, which was named for the legacy
// route.
export function useRefinerMetals(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerSpot[]>({
    queryKey: keys.refiners.metals(order_id),
    queryFn: () => apiRequest<RefinerSpot[]>("GET", `/orders/${order_id}/refiners/spots`),
    enabled: (options.enabled ?? true) && !!order_id,
    refetchInterval: 60_000,
  });
}

// THE REFINERY'S NUMBERS PER CUSTOMER LINE (wave 3):
// GET /orders/:orderId/refiners/items, verbatim refiners.items rows keyed by
// order_item_id. The assay report lives here. It used to ride on the composed
// order as scrap.purity_actual / post_melt_actual / content_actual, plus the
// refiner's premium as a field of the customer's own line - four values of
// another table wearing customer-facing names. Map them onto the items read
// by order_item_id.
export function useRefinerItems(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefinerItem[]>({
    queryKey: keys.refiners.items(order_id),
    queryFn: () => apiRequest<RefinerItem[]>("GET", `/orders/${order_id}/refiners/items`),
    enabled: (options.enabled ?? true) && !!order_id,
  });
}

// THE REQUEST BODIES ARE THE CONTRACT'S NOW (phase 3, A3), and the engagement
// one is where the null question was actually decided.
//
// `RefinerItemPatch` had not drifted and moves verbatim: premium: null clears
// it, and the assay fields carry what the refiner actually recovered, null
// where a figure is not yet known. `content` is DELIBERATELY not a field - the
// API derives it from post_melt (or pre_melt) and purity and refuses a raw
// override by name.
//
// `RefinerOrderPatch` had drifted on all four writable values - nullable in the
// API, non-null here - and it resolved four-to-one rather than either way:
//   - pool_oz_deducted / pool_remediation / fee LOST the null. Their exchange
//     shadows are each typed `number`, the API reached them through
//     `as number`, and every reader defaults them to 0, so clearing one and
//     setting it to 0 were the same order.
//   - refiner_id KEPT the null, and this side was the one that was wrong. It
//     is a nullable foreign key, not a fee: every engagement starts with it
//     null, and detaching one from a refinery is a real operation. No drawer
//     sends it today.

// Settles through the one order cache policy in
// orders/mutations.ts's invalidateOrder - refiner values render inside order
// reads and price the profit breakdown. Nothing is written optimistically;
// every refiner value is priced or assay data, and priced fields refetch
// (D83).

type PatchRefinerItemVars = {
  // The ORDER item's id - see the keying note above.
  order_item_id: string;
  // For invalidation only; the URL does not carry it.
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
  // The ENGAGEMENT row's id - order.refiner_order_id, never the customer
  // order's own id.
  refiner_order_id: string;
  // The customer order's id, for invalidation only; the URL does not carry it.
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
