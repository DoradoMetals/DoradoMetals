import type { CheckoutItem, CheckoutItemPatch } from "@dorado/contracts";
import type { Product } from '@/features/products/types'

// A basket line IS the contract's CheckoutItemPatch. `id` is a browser key so a
// line survives a re-render and a local declaration has something to be found
// by; it never crosses the wire. Nothing else is stored: name, image and mint
// are looked up from the catalogue by bullion_id, and content, premium and
// price are the server's.
export type CheckoutLine = CheckoutItemPatch & { id: string }

// A coin snapshots the product's weight the way the server does on create
// (ruling 51's FLOWS: gross -> pre_melt, t oz), so a parcel weighs correctly
// before the basket has round-tripped. toNewCheckoutItem strips them again:
// the API refuses a bullion line that names its own weights (ruling 43).
export const lineFromProduct = (product: Product, quantity = 1): CheckoutLine => ({
  id: product.id,
  bullion_id: product.id,
  pre_melt: product.gross ?? undefined,
  unit: 't oz',
  quantity,
})

export const lineFromRow = (row: CheckoutItem): CheckoutLine => ({
  id: row.id,
  bullion_id: row.bullion_id ?? undefined,
  metal_id: row.metal_id ?? undefined,
  pre_melt: row.pre_melt ?? undefined,
  post_melt: row.post_melt ?? undefined,
  purity: row.purity ?? undefined,
  unit: row.unit ?? undefined,
  quantity: Number(row.quantity ?? 1),
})

export const toNewCheckoutItem = ({ id, ...line }: CheckoutLine): CheckoutItemPatch =>
  line.bullion_id
    ? { bullion_id: line.bullion_id, quantity: line.quantity }
    : {
        metal_id: line.metal_id,
        pre_melt: line.pre_melt,
        post_melt: line.post_melt,
        purity: line.purity,
        unit: line.unit,
        quantity: line.quantity,
      }

export const isDeclaredLot = (line: CheckoutLine): boolean => !line.bullion_id

export const sameLine = (a: CheckoutLine, b: CheckoutLine): boolean =>
  a.bullion_id || b.bullion_id
    ? a.bullion_id === b.bullion_id
    : a.metal_id === b.metal_id &&
      a.pre_melt === b.pre_melt &&
      a.post_melt === b.post_melt &&
      a.purity === b.purity &&
      a.unit === b.unit
