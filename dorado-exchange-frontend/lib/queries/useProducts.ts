import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Product } from '@/types/product'

interface ProductFilters {
  metal_type?: string
  mint_type?: string
  product_type?: string
}

interface ProductGroup {
  default: Product
  variants: Product[]
}

export const useAllProducts = () => {
  return useQuery<Product[]>({
    queryKey: ['all_products'],
    queryFn: async () => {
      console.log('here')
      return await apiRequest<Product[]>('GET', '/products/get_all_products', undefined, {})
    },
    staleTime: Infinity,
  })
}

export const useFilteredProducts = (filters: ProductFilters) => {
  return useQuery<ProductGroup[]>({
    queryKey: ['products', JSON.stringify(filters)],
    queryFn: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_products',
        undefined,
        filters
      )
      const groups: Record<string, Product[]> = {}
      const singles: ProductGroup[] = []

      for (const product of products) {
        if (product.variant_group !== '') {
          if (!groups[product.variant_group]) groups[product.variant_group] = []
          groups[product.variant_group].push(product)
        } else {
          singles.push({ default: product, variants: [] })
        }
      }

      const grouped: ProductGroup[] = Object.values(groups).flatMap((variants) => {
        if (variants.length === 1) {
          return [{ default: variants[0], variants: [] }]
        }

        const defaultVariant = variants[variants.length - 1]
        return [{ default: defaultVariant, variants }]
      })

      return [...singles, ...grouped]
    },
    staleTime: 0,
  })
}

interface FiltersResponse {
  metals: string[]
  types: string[]
  mints: string[]
}

export const useProductFilters = () => {
  return useQuery<FiltersResponse>({
    queryKey: ['filters'],
    queryFn: async () => {
      return apiRequest<FiltersResponse>('GET', '/products/get_product_filters')
    },
  })
}
