import { apiRequest } from '@/shared/queries/axios'
import type { Product, ProductGroup, ProductFilters, AdminProduct, AdminTypes, Supplier, Carrier, AdminMints } from '@/features/products/types'
import { groupProducts } from '@/features/products/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { AdminMetal } from '@/features/spots/types'

export const useProducts = () => {
  return useApiQuery<Product[]>({
    key: queryKeys.productsRaw(),
    method: 'GET',
    url: '/products/get_all_products',
    staleTime: 0,
  })
}

export const useProductFromSlug = (slug: string) => {
  return useApiQuery<ProductGroup[]>({
    key: queryKeys.productFromSlug(slug),
    enabled: !!slug,
    staleTime: Infinity,
    requireUser: false,
    request: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_product_from_slug',
        undefined,
        { slug }
      )

      return groupProducts(products)
    },
  })
}

export const useSellProducts = () => {
  return useApiQuery<ProductGroup[]>({
    key: queryKeys.sellProducts(),
    staleTime: Infinity,
    requireUser: false,
    request: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_sell_products',
        undefined,
        {}
      )
      return groupProducts(products)
    },
  })
}

export const useHomepageProducts = () => {
  return useApiQuery<ProductGroup[]>({
    key: queryKeys.homepageProducts(),
    staleTime: Infinity,
    requireUser: false,
    request: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_homepage_products',
        undefined
      )
      return groupProducts(products)
    },
  })
}

export const useFilteredProducts = (filters: ProductFilters) => {
  return useApiQuery<ProductGroup[]>({
    key: queryKeys.filteredProducts(filters),
    staleTime: 0,
    requireUser: false,
    request: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_products',
        undefined,
        filters
      )
      return groupProducts(products)
    },
  })
}

export const useCreateProduct = () =>
  useApiMutation<AdminProduct, { name: string }, AdminProduct[]>({
    queryKey: queryKeys.adminProducts(),
    method: 'POST',
    url: '/admin/create_product',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: ({ name }, user) => ({
      name,
      created_by: user?.name,
    }),
  })

export const useSaveProduct = () =>
  useApiMutation<void, AdminProduct, AdminProduct[]>({
    queryKey: queryKeys.adminProducts(),
    method: 'POST',
    url: '/admin/save_product',
    requireAdmin: true,
    listAction: 'upsert',
    body: (product, user) => ({
      product,
      user,
    }),
  })

export const useAdminProducts = () =>
  useApiQuery<AdminProduct[]>({
    key: queryKeys.adminProducts(),
    method: 'GET',
    url: '/admin/get_products',
    requireAdmin: true,
    staleTime: 30000,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminTypes = () =>
  useApiQuery<AdminTypes[]>({
    key: queryKeys.adminTypes(),
    url: '/admin/get_product_types',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminMetals = () =>
  useApiQuery<AdminMetal[]>({
    key: queryKeys.adminMetals(),
    url: '/admin/get_metals',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminSuppliers = () =>
  useApiQuery<Supplier[]>({
    key: queryKeys.adminSuppliers(),
    url: '/suppliers/get_all',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminCarriers = () =>
  useApiQuery<Carrier[]>({
    key: queryKeys.adminCarriers(),
    url: '/carriers/get_all',
    method: 'GET',
    requireUser: true,
    staleTime: 0,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminMints = () =>
  useApiQuery<AdminMints[]>({
    key: queryKeys.adminMints(),
    url: '/admin/get_mints',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })
