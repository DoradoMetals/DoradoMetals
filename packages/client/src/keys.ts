export const keys = {
  orders: {
    all: () => ["orders"] as const,
    list: (narrowing: { direction?: string; user_id?: string } = {}) =>
      ["orders", "list", narrowing.direction ?? null, narrowing.user_id ?? null] as const,
    view: (order_id: string) => ["orders", "view", order_id] as const,
    items: (order_id: string) => ["orders", order_id, "items"] as const,
    spots: (order_id: string) => ["orders", order_id, "spots"] as const,
    address: (order_id: string) => ["orders", order_id, "address"] as const,
    shipments: (order_id: string) => ["orders", order_id, "shipments"] as const,
    payouts: (order_id: string) => ["orders", order_id, "payouts"] as const,
    scoped: (order_id: string) => ["orders", order_id] as const,
  },
  checkout: {
    all: () => ["checkout"] as const,
    row: (direction: string) => ["checkout", direction] as const,
    items: (direction: string) => ["checkout", "items", direction] as const,
  },
  payments: {
    methods: (direction?: string) => ["payments", "methods", direction ?? null] as const,
    intent: (type: string, subject?: string | null) =>
      ["payments", "intent", type, subject ?? null] as const,
    orderIntent: (order_id: string) => ["payments", "intent", "order", order_id] as const,
  },
  payouts: {
    details: (payout_id: string) => ["payouts", payout_id, "details"] as const,
  },
  addresses: {
    book: (subject?: string | null) => ["addresses", subject ?? null] as const,
    one: (address_id: string) => ["addresses", "one", address_id] as const,
    suggestions: (q: string) => ["addresses", "suggestions", q] as const,
    place: (place_id: string) => ["addresses", "place", place_id] as const,
  },
  users: {
    one: (user_id: string) => ["users", user_id] as const,
    all: () => ["users", "all"] as const,
    admins: () => ["users", "admins"] as const,
    ledger: () => ["users", "ledger"] as const,
  },
  fulfillments: {
    all: () => ["fulfillments"] as const,
    forOrder: (order_id: string) => ["fulfillments", "order", order_id] as const,
    one: (fulfillment_id: string) => ["fulfillments", "one", fulfillment_id] as const,
    rates: (
      fulfillment_id: string, address_id?: string | null, package_id?: string | null
    ) =>
      [
        "fulfillments", "rates", fulfillment_id,
        address_id ?? null, package_id ?? null,
      ] as const,
    schedule: (window: { from?: string; to?: string; employee_id?: string } = {}) =>
      [
        "fulfillments", "schedule",
        window.from ?? null, window.to ?? null, window.employee_id ?? null,
      ] as const,
    methods: (direction: string) => ["fulfillments", "methods", direction] as const,
    allMethods: () => ["fulfillments", "methods", "all"] as const,
  },
  shipping: {
    all: () => ["shipping"] as const,
    shipment: (shipment_id: string) => ["shipping", "shipment", shipment_id] as const,
    forOrder: (order_id: string) => ["orders", order_id, "shipments"] as const,
    handoffs: () => ["shipping", "handoffs"] as const,
    packages: () => ["shipping", "packages"] as const,
    carriers: () => ["shipping", "carriers"] as const,
    services: () => ["shipping", "services"] as const,
    servicesByCarrier: (carrier_id: string) =>
      ["shipping", "services", "carrier", carrier_id] as const,
    offeredServices: (carrier_id?: string | null) =>
      ["shipping", "services", "offered", carrier_id ?? null] as const,
    saleOptions: () => ["shipping", "services", "sale_options"] as const,
    locations: (address_id: string, radius_miles?: number) =>
      ["shipping", "locations", address_id, radius_miles ?? null] as const,
    pickupTimes: (address_id: string, code: string, readyDate: string) =>
      ["shipping", "pickup_times", address_id, code, readyDate] as const,
    validateAddress: (address_id: string) =>
      ["shipping", "validate_address", address_id] as const,
  },
  products: {
    all: () => ["products"] as const,
    list: (query: Record<string, unknown> = {}) =>
      ["products", "list", JSON.stringify(query)] as const,
    bySlug: (slug: string) => ["products", "slug", slug] as const,
    admin: () => ["products", "admin"] as const,
    types: () => ["products", "types"] as const,
    metals: () => ["metals"] as const,
    mints: () => ["mints"] as const,
  },
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
