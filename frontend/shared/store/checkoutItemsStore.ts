import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Direction } from "@dorado/contracts";
import { sameLine, type CheckoutLine } from '@/features/checkout/items/types'

// ONE store, direction as data - the same axis the API keys on
// (GET|PUT|DELETE /checkout/items?direction=). Nothing here is a price: the
// quote endpoints answer every number a customer sees.

type Baskets = { sale: CheckoutLine[]; purchase: CheckoutLine[] }

interface CheckoutItemsState extends Baskets {
  addItem: (direction: Direction, line: CheckoutLine) => void
  removeOne: (direction: Direction, line: CheckoutLine) => void
  removeAll: (direction: Direction, line: CheckoutLine) => void
  setItems: (direction: Direction, lines: CheckoutLine[]) => void
  clear: (direction: Direction) => void
  clearAll: () => void
  merge: (direction: Direction, server: CheckoutLine[]) => void
}

const collapse = (lines: CheckoutLine[]): CheckoutLine[] => {
  const out: CheckoutLine[] = []
  for (const line of lines) {
    const found = out.find((o) => sameLine(o, line))
    if (found) found.quantity = (found.quantity ?? 1) + (line.quantity ?? 1)
    else out.push({ ...line, quantity: line.quantity ?? 1 })
  }
  return out
}

export const useCheckoutItems = create<CheckoutItemsState>()(
  persist(
    (set, get) => ({
      sale: [],
      purchase: [],

      addItem: (direction, line) =>
        set({ [direction]: collapse([...get()[direction], line]) } as Partial<Baskets>),

      removeOne: (direction, line) =>
        set({
          [direction]: get()
            [direction].map((i) =>
              sameLine(i, line) ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i
            )
            .filter((i) => (i.quantity ?? 0) > 0),
        } as Partial<Baskets>),

      removeAll: (direction, line) =>
        set({
          [direction]: get()[direction].filter((i) => !sameLine(i, line)),
        } as Partial<Baskets>),

      setItems: (direction, lines) =>
        set({ [direction]: collapse(lines) } as Partial<Baskets>),

      clear: (direction) => set({ [direction]: [] } as Partial<Baskets>),

      clearAll: () => set({ sale: [], purchase: [] }),

      // On sign-in: the server's copy wins, browser-only lines survive.
      merge: (direction, server) =>
        set({
          [direction]: collapse([
            ...server,
            ...get()[direction].filter((local) => !server.some((s) => sameLine(s, local))),
          ]),
        } as Partial<Baskets>),
    }),
    {
      name: 'dorado_checkout_items',
      partialize: ({ sale, purchase }) => ({ sale, purchase }),
    }
  )
)
