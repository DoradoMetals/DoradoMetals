'use client'

import ProductCard from '@/features/products/ui/ProductCard'
import { useProducts } from '@dorado/client'
import { useCatalogQuote } from '@/features/quotes/queries'
import { catalogQuoteItems, unitPricesById } from '@/features/quotes/catalogPrices'
import { useProductFilterStore } from '@/shared/store/productFilterStore'

// THE FILTERED, SORTED, GROUPED LIST IS THE SERVER'S ANSWER. What lives in the
// browser is which filter is selected; the store's fields ARE the query
// params.
export default function BuyPage() {
  const { metal, category, type, search, sort } = useProductFilterStore()
  const { data: groups = [] } = useProducts({ metal, category, type, search, sort })

  // ONE ask quote for the whole grid - every card and every variant a card can
  // select is priced by this single batch, and each card reads its selected id
  // out of the map. Never a quote per card.
  const { data: quote } = useCatalogQuote(catalogQuoteItems(groups), 'ask')
  const unitPrices = unitPricesById(quote)

  return (
    <main className="flex justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 justify-items-center mb-6">
        {groups.map((group) => (
          <ProductCard
            key={group.default.id}
            product={group.default}
            variants={group.variants}
            unitPrices={unitPrices}
          />
        ))}
      </div>
    </main>
  )
}
