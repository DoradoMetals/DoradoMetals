// THE BASKET'S LINE ARITHMETIC, and nothing else.
//
// `PUT /api/checkout/lots` REPLACES a basket: it takes the whole list. So a
// click that adds one coin has to say what the whole basket is afterwards -
// which is these four functions, applied to the rows the server last answered
// with. Quantities only; no money, no weight, no content.
//
// *** THIS IS NOT A STORE, AND THAT IS THE POINT (ruling 63: "Frontend stores
// should be for UI elements, not data"). *** What survives is a request being
// built, not data being kept.
import type { CheckoutLotPatch, Lot } from '@dorado/contracts'
import { sameLine, toNewCheckoutLot } from '@/shared/types/checkoutLots'

// Two lines for the same thing are one line with a quantity - the same rule the
// API's own basket applies (checkout.lots is one row per lot, and a catalogue
// lot is unique on its product).
export const collapse = (lines: CheckoutLotPatch[]): CheckoutLotPatch[] => {
  const out: CheckoutLotPatch[] = []
  for (const line of lines) {
    const found = out.find((o) => sameLine(o, line))
    if (found) found.quantity = (found.quantity ?? 1) + (line.quantity ?? 1)
    else out.push({ ...line, quantity: line.quantity ?? 1 })
  }
  return out
}

export const addLine = (rows: Lot[], line: CheckoutLotPatch): CheckoutLotPatch[] =>
  collapse([...rows.map(toNewCheckoutLot), line])

// A ROW IS KEYED BY ITS ID, never by re-matching its declaration: the server
// answered it, so it has one.
export const addOne = (rows: Lot[], id: string): CheckoutLotPatch[] =>
  rows
    .map(toNewCheckoutLot)
    .map((l, i) => (rows[i].id === id ? { ...l, quantity: (l.quantity ?? 1) + 1 } : l))

export const dropOne = (rows: Lot[], id: string): CheckoutLotPatch[] =>
  rows
    .map(toNewCheckoutLot)
    .map((l, i) => (rows[i].id === id ? { ...l, quantity: (l.quantity ?? 1) - 1 } : l))
    .filter((l) => (l.quantity ?? 0) > 0)

export const dropAll = (rows: Lot[], id: string): CheckoutLotPatch[] =>
  rows.filter((r) => r.id !== id).map(toNewCheckoutLot)
