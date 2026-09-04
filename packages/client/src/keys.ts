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
  checkout: {
    // ONE ROW PER DIRECTION. The direction is a segment, never baked into a
    // hook name, so one basket's cache entry can never be served for the
    // other.
    row: (direction: string) => ["checkout", direction] as const,
    items: (direction: string) => ["checkout", "items", direction] as const,
    // Rates are the carrier's answer about a specific parcel, so the parcel's
    // facts are the key: a new address or box is a different question, not a
    // refetch of the old one.
    rates: (direction: string, address_id?: string | null, package_id?: string | null) =>
      ["checkout", "rates", direction, address_id ?? null, package_id ?? null] as const,
  },
  // ---------------------------------------------------------------- payments
  payments: {
    // The reference rows: how a customer pays us (sale) and how we pay them
    // (purchase). The direction is the key, never a hook name.
    methods: (direction?: string) => ["payments", "methods", direction ?? null] as const,
    // ONE INTENT PER CALLER, resolved server-side from the session. `subject`
    // is the customer an admin is ordering FOR - naming yourself is the same
    // read, so it defaults to null rather than to your own id.
    intent: (type: string, subject?: string | null) =>
      ["payments", "intent", type, subject ?? null] as const,
    // The intent attached to one order - the admin sales-order screen's read.
    orderIntent: (order_id: string) => ["payments", "intent", "order", order_id] as const,
  },
  payouts: {
    // RADIOACTIVE. Keyed so a details read is never confused with the
    // last-four payout row that hangs off an order; the hook itself refuses to
    // cache it (staleTime 0, gcTime 0).
    details: (payout_id: string) => ["payouts", payout_id, "details"] as const,
  },
  users: {
    one: (user_id: string) => ["users", user_id] as const,
    all: () => ["users", "all"] as const,
    admins: () => ["users", "admins"] as const,
    // The CALLER'S OWN credit ledger. No id in the key: the server reads the
    // subject off the session and a key naming one would imply otherwise.
    ledger: () => ["users", "ledger"] as const,
  },
  quotes: {
    purchase: (body: unknown) => ["quote", "purchase_order", JSON.stringify(body)] as const,
    sales: (body: unknown) => ["quote", "sales_order", JSON.stringify(body)] as const,
  },
} as const;
