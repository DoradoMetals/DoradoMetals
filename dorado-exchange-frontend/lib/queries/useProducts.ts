import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Product } from '@/types/product'

interface ProductFilters {
  metal_type?: string
  filter_category?: string
  product_type?: string
}

export interface ProductGroup {
  default: Product
  variants: Product[]
}

export const useProducts = () => {
  return useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      return await apiRequest<Product[]>('GET', '/products/get_all_products', undefined, {})
    },
    staleTime: 0,
  })
}

export const useAllProducts = () => {
  return useQuery<ProductGroup[]>({
    queryKey: ['all_products'],
    queryFn: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_all_products',
        undefined,
        {}
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
    staleTime: Infinity,
  })
}

export const useHomepageProducts = () => {
  return useQuery<ProductGroup[]>({
    queryKey: ['homepage_products'],
    queryFn: async () => {
      const products = await apiRequest<Product[]>(
        'GET',
        '/products/get_homepage_products',
        undefined
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
