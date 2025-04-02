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
    <div className="flex justify-center gap-4 mb-5 px-5">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-8 justify-items-center">
        {groupedProducts.map(({ default: product, variants }) => (
          <ProductCard key={product.product_name} product={product} variants={variants} />
        ))}
      </div>
    </div>
  )
}
