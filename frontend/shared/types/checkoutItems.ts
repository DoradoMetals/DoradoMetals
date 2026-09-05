import type { CheckoutItem, CheckoutItemPatch } from "@dorado/contracts";

// A BASKET LINE IS THE SERVER'S ROW. `useBasket` answers `checkout.items`,
// which already carries the content, the purity and the premium the API
// snapshotted at PUT time; nothing here re-derives any of them.
export type CheckoutLine = CheckoutItem

// The row, back as the wire's own line. A bullion line names its product and
// nothing else - ruling 43 refuses one that declares its own weight, and
// `create_from_product.sql` takes that snapshot server-side.
export const toNewCheckoutItem = (line: CheckoutLine): CheckoutItemPatch =>
  line.bullion_id
    ? { bullion_id: line.bullion_id, quantity: line.quantity ?? undefined }
    : {
        metal_id: line.metal_id ?? '',
        pre_melt: line.pre_melt ?? 0,
        post_melt: line.post_melt,
        purity: line.purity ?? 0,
        unit: line.unit ?? 't oz',
        quantity: line.quantity ?? undefined,
      }

export const isDeclaredLot = (line: { bullion_id?: string | null }): boolean => !line.bullion_id

// Two patches describe the same thing when they name the same product, or
// declare the same metal at the same weight and purity.
export const sameLine = (a: CheckoutItemPatch, b: CheckoutItemPatch): boolean =>
  'bullion_id' in a || 'bullion_id' in b
    ? 'bullion_id' in a && 'bullion_id' in b && a.bullion_id === b.bullion_id
    : 'metal_id' in a &&
      'metal_id' in b &&
      a.metal_id === b.metal_id &&
      a.pre_melt === b.pre_melt &&
      // The row spells an undeclared post-melt `null` and a fresh patch omits
      // it; the two are the same declaration, so they must compare equal.
      (a.post_melt ?? null) === (b.post_melt ?? null) &&
      a.purity === b.purity &&
      a.unit === b.unit
