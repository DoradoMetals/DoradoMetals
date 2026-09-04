import type { OrderItem, OrderSpot, SpotPrice } from '@dorado/contracts'

// DISPLAY NAMES ARE MAPPED, NOT JOINED (ruling 12). An orders.items row
// carries `bullion_id` and `metal_id` and no names at all; these are the two
// lookups every order screen does against reference lists it already caches -
// the catalogue (useProducts) and the spots list (useSpotPrices), whose `id`
// IS the metal's id.
//
// Nothing here is business logic. Every figure an order screen shows -
// `payable`, `line_total`, the totals, which buttons the order earns - comes
// off `OrderView` now; what is left is naming and ordering, which are the
// client's.

export const nameOf = <T extends { id: string; name?: string | null }>(
  list: T[],
  id: string | null | undefined
): string | null => (id ? (list.find((r) => r.id === id)?.name ?? null) : null)

export const byId = <T extends { id: string }>(
  list: T[],
  id: string | null | undefined
): T | null => (id ? (list.find((r) => r.id === id) ?? null) : null)

export type NamedOrderSpot<T extends { metal_id: string } = OrderSpot> = T & {
  name: string | null
}

export const nameSpots = <T extends { metal_id: string }>(
  spots: T[],
  metals: Pick<SpotPrice, 'id' | 'name'>[]
): (T & { name: string | null })[] =>
  spots.map((s) => ({ ...s, name: metals.find((m) => m.id === s.metal_id)?.name ?? null }))

// "Gold Item 1", "Silver Item 2" - a DISPLAY label for a scrap line, which has
// no name of its own because a scrap line is a weight and a purity. Pure in
// the metal name it is handed, which is why it is the one thing here with a
// unit test.
export type NamedScrapItem<T extends { metal_id: string } = OrderItem> = T & {
  metal: string
  name: string
}

export function assignScrapItemNames<T extends { metal_id: string }>(
  scrapItems: T[],
  metalNameOf: (metal_id: string) => string | null
): NamedScrapItem<T>[] {
  const metalOrder = ['Gold', 'Silver', 'Platinum', 'Palladium']

  const named = scrapItems
    .map((item) => ({ item, metal: metalNameOf(item.metal_id) }))
    .filter((n): n is { item: T; metal: string } => !!n.metal)

  named.sort((a, b) => metalOrder.indexOf(a.metal) - metalOrder.indexOf(b.metal))

  const grouped: Record<string, typeof named> = {}
  named.forEach((n) => {
    if (!grouped[n.metal]) grouped[n.metal] = []
    grouped[n.metal].push(n)
  })

  return named.map((n) => ({
    ...n.item,
    metal: n.metal,
    name: `${n.metal} Item ${grouped[n.metal].indexOf(n) + 1}`,
  }))
}
