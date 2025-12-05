import { apiRequest } from '@/utils/axiosInstance'
import type { Product, ProductGroup, ProductFilters } from '@/types/product'
import { groupProducts } from '@/types/product'
import { useApiQuery } from '../base'
import { queryKeys } from '../keyFactory'

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
