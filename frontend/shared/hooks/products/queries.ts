'use client'

// WHAT IS LEFT OF THIS FILE, and why any of it is left.
//
// Every catalogue hook lives in @dorado/client (ruling 62). Two things are
// kept here, and both call the client rather than the API:
//
//   `useProducts` - the WHOLE catalogue as a flat list, which is how the order
//   drawers and the basket's flair map a bullion_id onto a picture and a name.
//   The server answers GROUPS now, so the flattening happens once, here,
//   instead of in each of the eight surfaces that read it. It asks the SELL
//   side (`side: 'bid'`), which has no `display` gate at all (ruling 49): an
//   order can name a product that has since been pulled from the storefront,
//   and that id must still resolve to a name.
//
//   `useSaveProduct` - the admin drawer's save. Its dropdowns hold metal,
//   mint and supplier NAMES and the API takes IDS (ruling 43), so the names
//   are resolved here against the same reference lists the dropdowns render
//   from. Admin-form glue; it dies when the interim admin drawer does.
import { useMemo } from 'react'
import {
  useAdminProducts, useMetals, useMints, useProducts as useProductGroups,
  useUpdateProduct,
} from '@dorado/client'
import { useAdminSuppliers } from '@/shared/hooks/refiners/queries'
import type { BullionAdmin, BullionStorefront } from '@dorado/contracts'

export {
  useAdminProducts,
  useCreateProduct,
  useMetals,
  useMetals as useAdminMetals,
  useMints,
  useMints as useAdminMints,
  useProductTypes,
  useProductTypes as useAdminTypes,
} from '@dorado/client'
export { useAdminSuppliers } from '@/shared/hooks/refiners/queries'

export function useProducts() {
  const query = useProductGroups({ side: 'bid' })
  const groups = query.data
  const data = useMemo<BullionStorefront[]>(
    () => (groups ?? []).flatMap((g) => (g.variants.length ? g.variants : [g.default])),
    [groups]
  )
  return { ...query, data }
}

export function useSaveProduct() {
  const { data: metals = [] } = useMetals()
  const { data: mints = [] } = useMints()
  const { data: suppliers = [] } = useAdminSuppliers()
  const update = useUpdateProduct()

  return {
    ...update,
    mutate: (product: BullionAdmin) => {
      const { id, metal_id, mint, supplier, created_at, updated_at, created_by, updated_by, ...columns } =
        product
      update.mutate({
        id,
        patch: {
          ...columns,
          metal_id,
          mint_id: mints.find((m) => m.name === mint)?.id,
          supplier_id: suppliers.find((s) => s.organization.name === supplier)?.id,
        },
      })
    },
  }
}
