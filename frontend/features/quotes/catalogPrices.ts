// The card grids' half of the catalog quote (Jacob's no-client-math ruling:
// every customer-visible price is the server's answer). A page of cards fires
// ONE POST /quotes/catalog for the whole grid, never a quote per card: the
// page collects every id a card can select - the group default and each
// variant - quotes the batch, and hands each card the answers as a map.
import type { CatalogQuote } from "@dorado/contracts";
import type { ProductGroup } from '@/features/products/types'
import type { CatalogQuoteItem } from '@/features/quotes/queries'

// Every selectable id across the grid, deduped (a group's default is one of
// its own variants), in list order so the serialized query key stays stable.
export function catalogQuoteItems(groups: ProductGroup[]): CatalogQuoteItem[] {
  const seen = new Set<string>()
  const items: CatalogQuoteItem[] = []
  for (const { default: product, variants } of groups) {
    for (const p of [product, ...variants]) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      items.push({ id: p.id })
    }
  }
  return items
}

// The quote's per-unit answers keyed by product id - the shape the cards take
// as a prop. Empty until the quote lands, so a card prices at zero rather
// than NaN.
export function unitPricesById(quote?: CatalogQuote): Record<string, number> {
  return Object.fromEntries((quote?.items ?? []).map((l) => [l.id, l.unit_price]))
}
