// THE BASKET'S LINE ARITHMETIC, and nothing else.
//
// `PUT /api/checkout/items` REPLACES a basket: it takes the whole list. So a
// click that adds one coin has to say what the whole basket is afterwards -
// which is these four functions, applied to the rows the server last answered
// with. Quantities only; no money, no weight, no content.
//
// *** THIS IS NOT A STORE, AND THAT IS THE POINT (ruling 63: "Frontend stores
// should be for UI elements, not data"). *** What survives is a request being
// built, not data being kept.
import type { CheckoutItem, CheckoutItemPatch } from "@dorado/contracts";
import { sameLine, toNewCheckoutItem } from '@/shared/types/checkoutItems'

// Two lines for the same thing are one line with a quantity - the same rule the
// API's own basket applies (checkout.items is UNIQUE (checkout_id, bullion_id)).
export const collapse = (lines: CheckoutItemPatch[]): CheckoutItemPatch[] => {
  const out: CheckoutItemPatch[] = []
  for (const line of lines) {
    const found = out.find((o) => sameLine(o, line))
    if (found) found.quantity = (found.quantity ?? 1) + (line.quantity ?? 1)
    else out.push({ ...line, quantity: line.quantity ?? 1 })
  }
  return out
}

export const addLine = (
  rows: CheckoutItem[],
  line: CheckoutItemPatch
): CheckoutItemPatch[] => collapse([...rows.map(toNewCheckoutItem), line])

// A ROW IS KEYED BY ITS ID, never by re-matching its declaration: the server
// answered it, so it has one.
export const addOne = (rows: CheckoutItem[], id: string): CheckoutItemPatch[] =>
  rows.map(toNewCheckoutItem).map((l, i) =>
    rows[i].id === id ? { ...l, quantity: (l.quantity ?? 1) + 1 } : l
  )

export const dropOne = (rows: CheckoutItem[], id: string): CheckoutItemPatch[] =>
  rows
    .map(toNewCheckoutItem)
    .map((l, i) => (rows[i].id === id ? { ...l, quantity: (l.quantity ?? 1) - 1 } : l))
    .filter((l) => (l.quantity ?? 0) > 0)

export const dropAll = (rows: CheckoutItem[], id: string): CheckoutItemPatch[] =>
  rows.filter((r) => r.id !== id).map(toNewCheckoutItem)
