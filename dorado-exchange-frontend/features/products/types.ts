import { z } from 'zod'

export interface Product {
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

export const productSchema = z.object({
  id: z.string(),
  product_name: z.string(),
  product_description: z.string(),
  content: z.number(),
  purity: z.number(),
  gross: z.number(),
  bid_premium: z.number(),
  ask_premium: z.number(),
  product_type: z.string(),
  image_front: z.string(),
  image_back: z.string(),
  mint_name: z.string(),
  price: z.number().optional(),
  metal_type: z.string(),
  variant_group: z.string(),
  shadow_offset: z.number(),
  quantity: z.number().optional(),
  legal_tender: z.boolean().optional(),
  domestic_tender: z.boolean().optional(),
  sell_display: z.boolean(),
  is_generic: z.boolean(),
  variant_label: z.string().optional(),
})

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
