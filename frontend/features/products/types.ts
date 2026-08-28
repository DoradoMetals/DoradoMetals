import { z } from 'zod'
import type { BullionWire } from '@dorado/contracts'

// THIRD CONVERTED FEATURE (2026-08-27). The catalogue product is the
// contracts shape - products.bullion's own names, `name` / `description` /
// `type` where the legacy wire said product_name / product_description /
// product_type. The client adds what the API never sends: `price` is computed
// from the live spot, `quantity` is cart state. thickness/diameter existed on
// the old hand-written type and were read by nothing; they are gone.
//
// The products embedded in ORDER responses still speak the legacy names -
// that is the orders wire, unconverted. Those are typed
// features/orders/orderProducts.ts, not this.
export type Product = BullionWire & {
  price?: number
  quantity?: number
}

// The admin list and editor's shape. No contract covers the admin endpoint
// yet, so this stays hand-written - but the wire rename applies to it the
// same as the public list, so the three renamed columns are the new names.
export interface AdminProduct {
  id: string
  metal: string
  supplier: string
  name: string
  description: string
  bid_premium: number
  ask_premium: number
  type: string
  created_at: Date
  updated_at: Date
  image_front: string
  image_back: string
  display: boolean
  content: number
  gross: number
  purity: number
  mint: string 
  variant_group: string
  shadow_offset: number
  stock: number
  created_by: string
  updated_by: string
  homepage_display: boolean
  filter_category: string
  quantity: number
  slug: string
  legal_tender: boolean
  domestic_tender: boolean
  sell_display: boolean
  is_generic: boolean
  variant_label: string
  thickness?: string
  diameter?: string
  metal_type?: string
}

export interface Supplier {
  id: string
  name: string
  email: string
  phone: string
  created_at: Date
  updated_at: Date
  shipping_carrier: string
  logo: string,
  is_active: boolean,
}



export interface AdminMints {
  id: string,
  name: string,
  type: string,
  country: string,
  description: string,
  website: string,
  created_at: Date,
  updated_at: Date,
}

export interface AdminTypes {
  name: string,
}

// Parsed on the checkout path, so it must accept what the converted client
// actually holds: the contract's nullability, not the old hand-written
// optionality. `satisfies` pins it - if BullionWire gains or renames a field,
// this fails typecheck instead of silently rejecting checkouts at runtime.
export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  slug: z.string().nullable(),
  metal_type: z.string(),
  mint_name: z.string(),
  gross: z.number(),
  content: z.number(),
  purity: z.number(),
  bid_premium: z.number(),
  ask_premium: z.number(),
  image_front: z.string(),
  image_back: z.string(),
  shadow_offset: z.number(),
  variant_group: z.string(),
  variant_label: z.string().nullable(),
  is_generic: z.boolean().nullable(),
  legal_tender: z.boolean().nullable(),
  domestic_tender: z.boolean().nullable(),
  sell_display: z.boolean().nullable(),
  price: z.number().optional(),
  quantity: z.number().optional(),
}) satisfies z.ZodType<Product>

export interface ProductFilters {
  metal_type?: string
  filter_category?: string
  product_type?: string
}

export interface ProductGroup {
  default: Product
  variants: Product[]
}

export const groupProducts = (products: Product[]): ProductGroup[] => {
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
}
