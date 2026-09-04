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
  // THE ADDRESS BOOK. One key, because there is one read: an entry carries the
  // postal row, the caller's link and its actions together, so the two lists
  // the browser used to join by address_id cannot drift apart in a cache.
  // `subject` is the customer an admin is reading FOR - naming yourself is the
  // same read, so it defaults to null rather than to your own id.
  addresses: {
    book: (subject?: string | null) => ["addresses", subject ?? null] as const,
    one: (address_id: string) => ["addresses", "one", address_id] as const,
    // The provider's answers are keyed by the question. `session_token` is
    // deliberately NOT in the key: it is what makes a burst of keystrokes one
    // billed session, not part of what is being asked.
    suggestions: (q: string) => ["addresses", "suggestions", q] as const,
    place: (place_id: string) => ["addresses", "place", place_id] as const,
  },
  users: {
    one: (user_id: string) => ["users", user_id] as const,
    all: () => ["users", "all"] as const,
    admins: () => ["users", "admins"] as const,
    // The CALLER'S OWN credit ledger. No id in the key: the server reads the
    // subject off the session and a key naming one would imply otherwise.
    ledger: () => ["users", "ledger"] as const,
  },
  // HOW AN ORDER IS HANDED OVER. The fulfillment is keyed by its ORDER, which
  // is the id every caller holds - the fulfillment's own id is something they
  // learn from the view, not something they arrive with.
  fulfillments: {
    all: () => ["fulfillments"] as const,
    forOrder: (order_id: string) => ["fulfillments", "order", order_id] as const,
    // Everyone due somewhere in a window. The window is part of the question,
    // so it is part of the key.
    schedule: (window: { from?: string; to?: string; employee_id?: string } = {}) =>
      [
        "fulfillments", "schedule",
        window.from ?? null, window.to ?? null, window.employee_id ?? null,
      ] as const,
    // The reference menu, per direction.
    methods: (direction: string) => ["fulfillments", "methods", direction] as const,
    allMethods: () => ["fulfillments", "methods", "all"] as const,
  },
  shipping: {
    all: () => ["shipping"] as const,
    // ONE PARCEL, WHOLE - the ShipmentView, which carries its own timeline and
    // actions.
    shipment: (shipment_id: string) => ["shipping", "shipment", shipment_id] as const,
    // The order's parcels. Same rows the order-scoped read serves, so it keeps
    // that key: an order read and this one must not hold two answers.
    forOrder: (order_id: string) => ["orders", order_id, "shipments"] as const,
    // Reference data, cached hard - eleven rows and two, changing when the
    // business changes carriers.
    handoffs: () => ["shipping", "handoffs"] as const,
    packages: () => ["shipping", "packages"] as const,
    carriers: () => ["shipping", "carriers"] as const,
    services: () => ["shipping", "services"] as const,
    servicesByCarrier: (carrier_id: string) =>
      ["shipping", "services", "carrier", carrier_id] as const,
    offeredServices: (carrier_id?: string | null) =>
      ["shipping", "services", "offered", carrier_id ?? null] as const,
    saleOptions: () => ["shipping", "services", "sale_options"] as const,
    // A carrier's answer about a specific address, so the address is the key.
    locations: (address_id: string, radius_miles?: number) =>
      ["shipping", "locations", address_id, radius_miles ?? null] as const,
    pickupTimes: (address_id: string, code: string, readyDate: string) =>
      ["shipping", "pickup_times", address_id, code, readyDate] as const,
    validateAddress: (address_id: string) =>
      ["shipping", "validate_address", address_id] as const,
  },
  // ---------------------------------------------------------------- catalogue
  products: {
    all: () => ["products"] as const,
    // THE FILTER IS PART OF THE QUESTION. Serialized whole rather than
    // spelled field by field: a filter added to the query type is in the key
    // the same day, and a key that silently ignored one would serve a Gold
    // list for a Silver request.
    list: (query: Record<string, unknown> = {}) =>
      ["products", "list", JSON.stringify(query)] as const,
    // A slug names a FAMILY, not a row - four Gold American Eagles share one.
    bySlug: (slug: string) => ["products", "slug", slug] as const,
    admin: () => ["products", "admin"] as const,
    types: () => ["products", "types"] as const,
    // Reference rows, cached hard.
    metals: () => ["metals"] as const,
    mints: () => ["mints"] as const,
  },
  // The live quotes. One key: the feed is four rows and every screen wants all
  // of them.
  spots: {
    all: () => ["spots"] as const,
  },
  rates: {
    scoped: () => ["rates"] as const,
    all: () => ["rates", "public"] as const,
    tiers: () => ["rates", "tiers"] as const,
    admin: () => ["rates", "admin"] as const,
  },
  quotes: {
    purchase: (body: unknown) => ["quote", "purchase_order", JSON.stringify(body)] as const,
    sales: (body: unknown) => ["quote", "sales_order", JSON.stringify(body)] as const,
    catalog: (items: unknown, side: string) =>
      ["quote", "catalog", side, JSON.stringify(items)] as const,
    // ONE EXISTING order's estimate; `order` is the prefix profit invalidates
    // alongside, since both reprice off the same inputs.
    order: (order_id: string) => ["quote", "order", order_id] as const,
    profit: (order_id: string) => ["quote", "order", order_id, "profit"] as const,
  },
  refiners: {
    suppliers: () => ["suppliers"] as const,
    order: (order_id: string) => ["refiner_order", order_id] as const,
    metals: (order_id: string) => ["refiner_metals", order_id] as const,
    items: (order_id: string) => ["refiner_items", order_id] as const,
  },
  leads: {
    all: () => ["leads"] as const,
  },
  reviews: {
    all: () => ["reviews"] as const,
    public: () => ["reviews", "public"] as const,
  },
  media: {
    images: {
      all: () => ["media", "images"] as const,
    },
  },
} as const;
