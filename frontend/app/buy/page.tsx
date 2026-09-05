'use client'

import ProductCard from './_src_/products/ui/ProductCard'
import { useProducts } from '@dorado/client'
import { useProductFilterStore } from '@/shared/store/productFilterStore'

// THE FILTERED, SORTED, GROUPED LIST IS THE SERVER'S ANSWER. What lives in the
// browser is which filter is selected; the store's fields ARE the query
// params.
export default function BuyPage() {
  const { metal, category, type, search, sort } = useProductFilterStore()
  const { data: groups = [] } = useProducts({ metal_id: metal, category, type, search, sort })


  return (
    <main className="flex justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 justify-items-center mb-6">
        {groups.map((group) => (
          <ProductCard
            key={group.default.id}
            product={group.default}
            variants={group.variants}
          />
        ))}
      </div>
    </main>
  )
}
