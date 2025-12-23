'use client'

import ProductPageDetails from '@/features/products/ui/ProductPageDetails'
import { useProductFromSlug } from '@/features/products/queries'
import { useParams } from 'next/navigation'

export default function ProductPage() {
  const { slug } = useParams()
  const { data: groupedProducts = [], isLoading } = useProductFromSlug(slug as string)
  return (
    <div className="flex justify-center items-center w-full">
      <div className="w-full max-w-5xl px-4 py-4 sm:py-10">
        {groupedProducts.map(({ default: product, variants }) => (
          <ProductPageDetails key={product.product_name} product={product} variants={variants} />
        ))}
      </div>
    </div>
  )
}
