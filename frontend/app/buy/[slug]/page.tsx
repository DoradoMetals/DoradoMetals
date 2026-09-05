'use client'

import ProductPageDetails from '../_src_/products/ui/ProductPageDetails'
import { useProduct } from '@dorado/client'
import { useParams } from 'next/navigation'

// A SLUG NAMES ONE FAMILY, and the server answers one group: the headline row
// and its siblings, heaviest first. This page used to map over a list because
// the read returned every row that shared the slug and the browser grouped
// them.
export default function ProductPage() {
  const { slug } = useParams()
  const { data: group } = useProduct(typeof slug === 'string' ? slug : null)

  return (
    <main className="flex justify-center items-center w-full">
      <div className="w-full max-w-5xl px-4 py-4 sm:py-10">
        {group && <ProductPageDetails product={group.default} variants={group.variants} />}
      </div>
    </main>
  )
}
