// THE QUERY KEYS, in one place, so an invalidation and the read it invalidates
// cannot drift apart. A key is a function of what identifies the read and
// nothing else; the prefixes are what mutations invalidate.
export const keys = {
  orders: {
    // The slim list - the row plus `totals`. `direction` and `user_id` narrow
    // it, and both belong in the key: the same customer's purchases and sales
    // are two different reads.
    all: () => ["orders"] as const,
    list: (narrowing: { direction?: string; user_id?: string } = {}) =>
      ["orders", "list", narrowing.direction ?? null, narrowing.user_id ?? null] as const,
    // ONE ORDER, WHOLE - the OrderView, which carries its own `actions`.
    view: (order_id: string) => ["orders", "view", order_id] as const,
    items: (order_id: string) => ["orders", order_id, "items"] as const,
    spots: (order_id: string) => ["orders", order_id, "spots"] as const,
    address: (order_id: string) => ["orders", order_id, "address"] as const,
    shipments: (order_id: string) => ["orders", order_id, "shipments"] as const,
    payouts: (order_id: string) => ["orders", order_id, "payouts"] as const,
    // Everything scoped to one order, for the one-line invalidation after a
    // write. It is the same prefix every order-scoped read above begins with.
    scoped: (order_id: string) => ["orders", order_id] as const,
  },
} as const;
