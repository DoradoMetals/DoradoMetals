'use client'

import { useFilteredProducts } from '@/lib/queries/useProducts'
import ProductCard from '@/components/custom/products/productcard'
import { useProductFilterStore } from '@/store/productFilterStore'

export default function Page() {
  const { metal_type, mint_type, product_type } = useProductFilterStore()
  const { data: products = [], isLoading } = useFilteredProducts({
    metal_type,
    mint_type,
    product_type,
  })

  return (
    <div className="flex justify-center gap-4">
      <div className="flex-col">
        {products.map((product, index) => (
          <ProductCard key={index} product={product} />
        ))}
      </div>
    </div>
  )
}
