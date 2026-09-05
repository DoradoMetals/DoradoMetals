'use client'

import { useMemo } from 'react'
import { useProducts } from '@/features/products/queries'
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

// Index-aligned with the input, because a basket surface renders its lines in
// the order the server answered them.
export function useDecoratedLines(lines: CheckoutLine[]): DecoratedLine[] {
  const { data: products = [] } = useProducts()

  return useMemo(() => {
    const productOf = new Map(products.map((p) => [p.id, p]))
    const seen: Record<string, number> = {}

    return lines.map((line, index) => {
      const product = line.bullion_id ? productOf.get(line.bullion_id) : undefined
      // The metal's id IS its name (migration 132), so there is nothing to look up.
      const metal = line.metal_id ?? product?.metal_id ?? null

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
  }, [lines, products])
}
