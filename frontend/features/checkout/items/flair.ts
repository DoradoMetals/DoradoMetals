'use client'

import { useMemo } from 'react'
import { useProducts } from '@/features/products/queries'
import { useSpotPrices } from '@/features/spots/queries'
import type { Product } from '@/features/products/types'
import { type CheckoutLine } from '@/features/checkout/items/types'

// Flair only (ruling 51): the catalogue supplies the picture and the words, and
// nothing else. Every weight, purity and price on the screen is the line's own
// or the server's.
export type DecoratedLine = {
  line: CheckoutLine
  index: number
  product?: Product
  metal: string | null
  name: string
  image_front: string | null
  mint_name: string | null
}

// Index-aligned with the input, because a purchase quote pairs its lines back
// by request position.
export function useDecoratedLines(lines: CheckoutLine[]): DecoratedLine[] {
  const { data: products = [] } = useProducts()
  const { data: metals = [] } = useSpotPrices()

  return useMemo(() => {
    const productOf = new Map(products.map((p) => [p.id, p]))
    const metalOf = new Map(metals.map((m) => [m.id, m.name]))
    const seen: Record<string, number> = {}

    return lines.map((line, index) => {
      const product = line.bullion_id ? productOf.get(line.bullion_id) : undefined
      const metal = (line.metal_id ? metalOf.get(line.metal_id) : product?.metal_type) ?? null

      if (product || line.bullion_id) {
        return {
          line,
          index,
          product,
          metal,
          name: product?.name ?? 'Item',
          image_front: product?.image_front ?? null,
          mint_name: product?.mint_name ?? null,
        }
      }

      const key = metal ?? 'Item'
      seen[key] = (seen[key] ?? 0) + 1
      return {
        line,
        index,
        product: undefined,
        metal,
        name: `${key} Item ${seen[key]}`,
        image_front: null,
        mint_name: null,
      }
    })
  }, [lines, products, metals])
}
