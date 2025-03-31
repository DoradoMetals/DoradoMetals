'use client'

import { useFilteredProducts } from '@/lib/queries/useProducts'
import ProductCard from '@/components/custom/products/productCard'
import { useProductFilterStore } from '@/store/productFilterStore'

export default function BuyPage() {
  const { metal_type, mint_type, product_type } = useProductFilterStore()
  const { data: groupedProducts = [], isLoading } = useFilteredProducts({
    metal_type,
    mint_type,
    product_type,
  })

  return (
    <div className="flex justify-center gap-4">
      <div className="flex-col">
        {groupedProducts.map(({ default: product, variants }, index) => (
          <ProductCard key={index} product={product} variants={variants} />
        ))}
      </div>
    </div>
  )
}