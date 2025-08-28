'use client'

import { useFilteredProducts } from '@/lib/queries/useProducts'
import ProductCard from '@/components/custom/products/productCard'
import { useProductFilterStore } from '@/store/productFilterStore'

export default function BuyPage() {
  const { metal_type, filter_category, product_type } = useProductFilterStore()
  const { data: groupedProducts = [], isLoading } = useFilteredProducts({
    metal_type,
    filter_category,
    product_type,
  })

  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 justify-items-center mb-6 bg-transparent">
        {groupedProducts.map(({ default: product, variants }) => (
          <ProductCard key={product.product_name} product={product} variants={variants} />
        ))}
      </div>
    </div>
  )
}
