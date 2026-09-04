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
  quotes: {
    purchase: (body: unknown) => ["quote", "purchase_order", JSON.stringify(body)] as const,
    sales: (body: unknown) => ["quote", "sales_order", JSON.stringify(body)] as const,
  },
} as const;
