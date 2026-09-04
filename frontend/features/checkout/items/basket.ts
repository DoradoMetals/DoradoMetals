// THE BASKET'S LINE ARITHMETIC, and nothing else.
//
// `PUT /api/checkout/items` REPLACES a basket: it is the sync, and it takes the
// whole list. So a click that adds one coin has to say what the whole basket is
// afterwards - which is these three functions, applied to the rows the server
// last answered with.
//
// *** THIS IS NOT A STORE, AND THAT IS THE POINT (ruling 63: "Frontend stores
// should be for UI elements, not data"). *** It replaces
// shared/store/checkoutItemsStore.ts, a persisted zustand basket that WAS the
// signed-out customer's only copy - a second source of truth for the same rows,
// merged into the server's on sign-in by a function nobody could see run. A
// visitor gets an anonymous account and real rows now, so the browser holds no
// basket at all; what survives is the arithmetic for composing the next PUT,
// which is a request being built rather than data being kept.
import { sameLine, type CheckoutLine } from '@/features/checkout/items/types'

// Two lines for the same thing are one line with a quantity - the same rule the
// API's own basket applies (checkout.items is UNIQUE (checkout_id, bullion_id)).
export const collapse = (lines: CheckoutLine[]): CheckoutLine[] => {
  const out: CheckoutLine[] = []
  for (const line of lines) {
    const found = out.find((o) => sameLine(o, line))
    if (found) found.quantity = (found.quantity ?? 1) + (line.quantity ?? 1)
    else out.push({ ...line, quantity: line.quantity ?? 1 })
  }
  return out
}

export const addLine = (lines: CheckoutLine[], line: CheckoutLine): CheckoutLine[] =>
  collapse([...lines, line])

// One off the count; the line goes when the count reaches zero.
export const removeOne = (lines: CheckoutLine[], line: CheckoutLine): CheckoutLine[] =>
  lines
    .map((i) => (sameLine(i, line) ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i))
    .filter((i) => (i.quantity ?? 0) > 0)

export const removeAll = (lines: CheckoutLine[], line: CheckoutLine): CheckoutLine[] =>
  lines.filter((i) => !sameLine(i, line))
