import type { SpotPrice } from "@dorado/contracts";
import { apiRequest } from '@/shared/queries/axios'
import type { Product, ProductGroup, ProductFilters, AdminProduct, AdminTypes, Supplier, AdminMints } from '@/features/products/types'
import { groupProducts } from '@/features/products/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

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
    url: '/products/create_product',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: ({ name }) => ({
      name,
    }),
  })

// The admin read joins metal/supplier/mint down to NAMES (compose.ts's own
// comment: "the admin form sends those names straight back" - true of the
// old wire, not this one). save_product now takes metal_id/supplier_id/
// mint_id (ruling 43 - ids for what the server holds), so the ids are
// resolved here from the same cached reference reads the drawer's dropdowns
// already use, and every field ProductPatch does not declare (the names
// themselves, the audit columns, the two dead spec fields) is dropped
// rather than sent for the strict body to 400 on.
export const useSaveProduct = () => {
  const { data: metals = [] } = useAdminMetals()
  const { data: suppliers = [] } = useAdminSuppliers()
  const { data: mints = [] } = useAdminMints()

  return useApiMutation<void, AdminProduct, AdminProduct[]>({
    queryKey: queryKeys.adminProducts(),
    method: 'POST',
    url: '/products/save_product',
    requireAdmin: true,
    listAction: 'upsert',
    body: (product) => {
      const {
        metal,
        supplier,
        mint,
        created_at,
        updated_at,
        created_by,
        updated_by,
        thickness,
        diameter,
        metal_type,
        ...patch
      } = product

      return {
        product: {
          ...patch,
          metal_id: metals.find((m) => m.name === metal)?.id,
          supplier_id: suppliers.find((s) => s.organization.name === supplier)?.id,
          mint_id: mints.find((m) => m.name === mint)?.id,
        },
      }
    },
  })
}

export const useAdminProducts = () =>
  useApiQuery<AdminProduct[]>({
    key: queryKeys.adminProducts(),
    method: 'GET',
    url: '/products/get_admin_products',
    requireAdmin: true,
    staleTime: 30000,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

export const useAdminTypes = () =>
  useApiQuery<AdminTypes[]>({
    key: queryKeys.adminTypes(),
    url: '/products/get_product_types',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })

// /products/get_metals serves the composed spot shape - the same
// name/ask/bid the live feed serves - with no wire conversion on the route.
// The old AdminMetal type (type/ask_spot as strings) described a response
// this endpoint stopped sending at the products restructure; the drawer's
// metal dropdown was reading `.type` off rows that no longer had one (D72).
export const useAdminMetals = () =>
  useApiQuery<SpotPrice[]>({
    key: queryKeys.adminMetals(),
    url: '/products/get_metals',
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

export const useAdminMints = () =>
  useApiQuery<AdminMints[]>({
    key: queryKeys.adminMints(),
    url: '/products/get_mints',
    method: 'GET',
    requireAdmin: true,
    params: (user) => ({
      user_id: user?.id,
    }),
  })
