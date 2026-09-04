"use client";

// THE CATALOGUE. One hook per endpoint, typed only from @dorado/contracts.
//
// GET /products answers GROUPS, not rows: a family (`variant_group`), its
// headline row and its siblings, ordered heaviest first. Four screens used to
// do that grouping and that sort for themselves, and two of them disagreed
// with each other about which member was the default.
//
// THE FILTER IS THE SERVER'S TOO. Metal, category, shape, the search box and
// the buy/sell side are query params; what stays in the browser is only which
// filter the customer has SELECTED. `side: "bid"` is the sell listing and has
// no `display` gate at all (ruling 49).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BullionAdmin, BullionGroup, BullionPatch, Metal, Mint,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

export type ProductQuery = {
  side?: "ask" | "bid";
  placement?: "storefront" | "homepage";
  metal?: string;
  category?: string;
  type?: string;
  search?: string;
  generic?: boolean;
  sort?: "name" | "content" | "newest";
};

// Not a hook: the sitemap builds at request time, on the server, outside
// react-query entirely.
export const fetchProducts = (query: ProductQuery = {}) =>
  apiRequest<BullionGroup[]>("GET", "/products", undefined, query);

export function useProducts(query: ProductQuery = {}, enabled = true) {
  return useQuery<BullionGroup[]>({
    queryKey: keys.products.list(query),
    queryFn: () => fetchProducts(query),
    enabled,
  });
}

// ONE PRODUCT PAGE. A slug names the whole family, so this is one group.
export function useProduct(slug: string | null | undefined) {
  return useQuery<BullionGroup>({
    queryKey: keys.products.bySlug(slug ?? ""),
    queryFn: () => apiRequest<BullionGroup>("GET", `/products/${slug}`),
    enabled: !!slug,
    retry: false,
  });
}

export function useAdminProducts(enabled = true) {
  return useQuery<BullionAdmin[]>({
    queryKey: keys.products.admin(),
    queryFn: () => apiRequest<BullionAdmin[]>("GET", "/products/admin"),
    enabled,
  });
}

// A bare list of the shapes in the catalogue (ruling 12), for the admin
// dropdown.
export function useProductTypes(enabled = true) {
  return useQuery<string[]>({
    queryKey: keys.products.types(),
    queryFn: () => apiRequest<string[]>("GET", "/products/types"),
    enabled,
  });
}

// Reference data, cached hard: four metals and ten mints, changing when the
// business starts stocking something new.
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

export function useMetals(enabled = true) {
  return useQuery<Metal[]>({
    queryKey: keys.products.metals(),
    queryFn: () => apiRequest<Metal[]>("GET", "/metals"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useMints(enabled = true) {
  return useQuery<Mint[]>({
    queryKey: keys.products.mints(),
    queryFn: () => apiRequest<Mint[]>("GET", "/mints"),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  });
}

// Every write answers the composed admin row, so the cache is written FROM THE
// RESPONSE rather than invalidated and re-fetched. The public lists still go,
// because a catalogue edit changes what a visitor sees.
function absorb(
  client: ReturnType<typeof useQueryClient>, row: BullionAdmin
): BullionAdmin {
  client.setQueryData<BullionAdmin[]>(keys.products.admin(), (rows) =>
    rows ? [row, ...rows.filter((r) => r.id !== row.id)] : [row]
  );
  client.invalidateQueries({ queryKey: keys.products.all() });
  return row;
}

export function useCreateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: BullionPatch) =>
      apiRequest<BullionAdmin>("POST", "/products", patch),
    onSuccess: (row) => absorb(client, row),
  });
}

export function useUpdateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BullionPatch }) =>
      apiRequest<BullionAdmin>("PATCH", `/products/${id}`, patch),
    onSuccess: (row) => absorb(client, row),
  });
}
