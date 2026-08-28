// The product as the ORDERS wire still serves it - legacy names.
//
// The catalogue converted (features/products/types.ts speaks `name` /
// `description` / `type` from @dorado/contracts), but a product EMBEDDED in
// an order response - item.product on purchase orders, sales order lines -
// arrives on the orders endpoints, which have not converted. Same seam as
// [[orderSpots]]: one entity, two wires, two types.
//
// Nothing maps up here, deliberately. Order UI reads these fields directly
// and converts WITH the orders feature; the pricing utils read only the
// unrenamed fields (content, premiums, metal_type), so they accept either
// shape. THE WHOLE FILE DIES WITH THE ORDERS CONVERSION.
export interface OrderProduct {
  id: string
  product_name: string
  product_description: string
  content: number
  purity: number
  gross: number
  bid_premium: number
  ask_premium: number
  product_type: string
  image_front: string
  image_back: string
  quantity?: number
  mint_name: string
  price?: number
  metal_type: string
  variant_group: string
  shadow_offset: number
  slug?: string
  legal_tender?: boolean
  domestic_tender?: boolean
  sell_display: boolean
  is_generic: boolean
  variant_label?: string
}

// The catalogue shape, converted down. Used where the client holds a NEW
// product (a catalogue pick) and must hand it to something that speaks the
// orders wire: the add-item optimistic update, whose object the order UI
// reads legacy names off until the server copy replaces it.
import type { Product } from '@/features/products/types'

export function toOrderProduct(p: Product): OrderProduct {
  const { name, description, type, slug, variant_label, is_generic, legal_tender, domestic_tender, sell_display, ...rest } = p
  return {
    ...rest,
    product_name: name,
    product_description: description,
    product_type: type,
    slug: slug ?? undefined,
    variant_label: variant_label ?? undefined,
    is_generic: is_generic ?? false,
    legal_tender: legal_tender ?? undefined,
    domestic_tender: domestic_tender ?? undefined,
    sell_display: sell_display ?? false,
  }
}
