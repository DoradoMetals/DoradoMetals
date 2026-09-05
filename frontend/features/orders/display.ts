// DISPLAY NAMES ARE MAPPED, NOT JOINED (ruling 12), and there is almost
// nothing left to map.
//
// `nameOf`, `nameSpots` and `assignScrapItemNames` are gone. The metal's id IS
// its name (migration 132), so every metal lookup here was the identity
// function; a product line carries `product_name` and a scrap lot carries
// `item_name` - "Gold Item 2", numbered per metal by a window function in
// `db/orders/sql/view.sql` (ruling 78) - so the four-metal ordering dictionary
// and the per-metal counter it fed went with them.
//
// What is left is one lookup into a list the client already caches.
export const byId = <T extends { id: string }>(
  list: T[],
  id: string | null | undefined
): T | null => (id ? (list.find((r) => r.id === id) ?? null) : null)
