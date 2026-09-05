'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BullionAdmin, BullionGroup, BullionPatch, Metal, Mint } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export type ProductQuery = {
  side?: 'ask' | 'bid'
  placement?: 'storefront' | 'homepage'
  metal_id?: string
  category?: string
  type?: string
  search?: string
  generic?: boolean
  sort?: 'name' | 'content' | 'newest'
}

export const fetchProducts = (query: ProductQuery = {}) =>
  apiRequest<BullionGroup[]>('GET', '/products', undefined, query)

export function useProducts(query: ProductQuery = {}, enabled = true) {
  return useQuery<BullionGroup[]>({
    queryKey: keys.products.list(query),
    queryFn: () => fetchProducts(query),
    enabled,
  })
}

export function useProduct(slug: string | null | undefined) {
  return useQuery<BullionGroup>({
    queryKey: keys.products.bySlug(slug ?? ''),
    queryFn: () => apiRequest<BullionGroup>('GET', `/products/${slug}`),
    enabled: !!slug,
    retry: false,
  })
}

export function useAdminProducts(enabled = true) {
  return useQuery<BullionAdmin[]>({
    queryKey: keys.products.admin(),
    queryFn: () => apiRequest<BullionAdmin[]>('GET', '/products/admin'),
    enabled,
  })
}

export function useProductTypes(enabled = true) {
  return useQuery<string[]>({
    queryKey: keys.products.types(),
    queryFn: () => apiRequest<string[]>('GET', '/products/types'),
    enabled,
  })
}

const REFERENCE_STALE_TIME = 60 * 60 * 1000

export function useMetals(enabled = true) {
  return useQuery<Metal[]>({
    queryKey: keys.products.metals(),
    queryFn: () => apiRequest<Metal[]>('GET', '/metals'),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  })
}

export function useMints(enabled = true) {
  return useQuery<Mint[]>({
    queryKey: keys.products.mints(),
    queryFn: () => apiRequest<Mint[]>('GET', '/mints'),
    enabled,
    staleTime: REFERENCE_STALE_TIME,
  })
}

function absorb(client: ReturnType<typeof useQueryClient>, row: BullionAdmin): BullionAdmin {
  client.setQueryData<BullionAdmin[]>(keys.products.admin(), (rows) =>
    rows ? [row, ...rows.filter((r) => r.id !== row.id)] : [row]
  )
  client.invalidateQueries({ queryKey: keys.products.all() })
  return row
}

export function useCreateProduct() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: BullionPatch) => apiRequest<BullionAdmin>('POST', '/products', patch),
    onSuccess: (row) => absorb(client, row),
  })
}

export function useUpdateProduct() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BullionPatch }) =>
      apiRequest<BullionAdmin>('PATCH', `/products/${id}`, patch),
    onSuccess: (row) => absorb(client, row),
  })
}
