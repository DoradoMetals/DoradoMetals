'use client'

import ProductCard from '@/features/products/ui/ProductCard'
import { useFilteredProducts } from '@/features/products/queries'
import { useCatalogQuote } from '@/features/quotes/queries'
import { catalogQuoteItems, unitPricesById } from '@/features/quotes/catalogPrices'
import { useProductFilterStore } from '@/shared/store/productFilterStore'

export default function BuyPage() {
  const { metal_type, filter_category, product_type } = useProductFilterStore()
  const { data: groupedProducts = [], isLoading } = useFilteredProducts({
    metal_type,
    filter_category,
    product_type,
  })

  // ONE ask quote for the whole grid - every card and every variant a card
  // can select is priced by this single batch, and each card reads its
  // selected id out of the map. Never a quote per card.
  const { data: quote } = useCatalogQuote(catalogQuoteItems(groupedProducts), 'ask')
  const unitPrices = unitPricesById(quote)

  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 justify-items-center mb-6 bg-transparent">
        {groupedProducts.map(({ default: product, variants }) => (
          <ProductCard
            key={product.name}
            product={product}
            variants={variants}
            unitPrices={unitPrices}
          />
        ))}
      </div>
    </div>
  )
}
