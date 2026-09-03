import { z } from 'zod/v4'
import { products, refiners } from "@dorado/contracts";

// THIRD CONVERTED FEATURE (2026-08-27). The catalogue product is the
// contracts shape - products.bullion's own names, `name` / `description` /
// `type` where the legacy wire said product_name / product_description /
// product_type. The client adds what the API never sends: `price` is computed
// from the live spot, `quantity` is cart state. thickness/diameter existed on
// the old hand-written type and were read by nothing; they are gone.
//
// The products embedded in ORDER responses converted with the orders wire
// (2026-08-28) and speak the same names; those are the contracts'
// ProductOnOrderItem, not this - an order item's product summary, not the
// catalogue row.
export type Product = products.bullion.Storefront & {
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
  is_generic: boolean
  variant_label: string
  thickness?: string
  diameter?: string
  metal_type?: string
}

// A supplier is a refiner: an organization with a role, and since the
// refiners conversion (2026-08-27) the frontend reads it nested from
// @dorado/contracts. The old flat interface also claimed a
// `shipping_carrier` field no wire ever served - read by nothing, gone.
export type Supplier = refiners.refiners.Read



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

// Parsed on the checkout path. DERIVED from the contract now that this file
// is zod v4 like the contracts: the catalogue shape IS products.bullion.Storefront, plus the
// two fields the client adds (`price` from the live spot, `quantity` cart
// state). `satisfies` still pins the output to Product, so a contract change
// fails typecheck here rather than silently rejecting checkouts at runtime.
export const productSchema = products.bullion.Storefront.extend({
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
