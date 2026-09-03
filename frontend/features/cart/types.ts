import type { checkout } from "@dorado/contracts";
import { z } from 'zod/v4'
import type { Product } from '@/features/products/types'

// One flat basket line: the checkout.items columns, plus display-only flair.
// `bullion_id === null` is what makes a line a declared lot.
export const sellCartItemSchema = z.object({
  id: z.string(),

  bullion_id: z.string().nullable(),
  metal_id: z.string().nullable(),
  pre_melt: z.number().nullable(),
  post_melt: z.number().nullable(),
  purity: z.number().nullable(),
  unit: z.string().nullable(),
  quantity: z.number(),

  // Display only, never sent.
  gross: z.number().nullable(),
  metal: z.string().nullable(),
  name: z.string().nullable(),
  image_front: z.string().nullable(),
  mint_name: z.string().nullable(),
})

export type SellCartItem = z.infer<typeof sellCartItemSchema>

export type NewCheckoutItem = checkout.items.New;

// The product id doubles as the line id: two lines of one product are one line.
export function sellLineFromProduct(product: Product, quantity = 1): SellCartItem {
  return {
    id: product.id,
    bullion_id: product.id,
    metal_id: null,
    pre_melt: null,
    post_melt: null,
    purity: null,
    unit: null,
    quantity,
    gross: product.gross ?? null,
    metal: product.metal_type ?? null,
    name: product.name ?? null,
    image_front: product.image_front ?? null,
    mint_name: product.mint_name ?? null,
  }
}
