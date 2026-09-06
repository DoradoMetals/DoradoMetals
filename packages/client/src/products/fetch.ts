// No 'use client': the sitemap renders on the server and needs the plain
// fetcher, not a client reference.
import type { BullionGroup } from '@dorado/contracts'

import { apiRequest } from '../fetch'

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
