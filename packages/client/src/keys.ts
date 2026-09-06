// THE QUERY-KEY TABLE.
//
// One namespace per resource, and a namespace exists only while a hook that
// caches under it exists. The table is not a registry of what the API can
// answer - it is a registry of what this app currently caches - so a key for a
// hook that no longer exists is a claim nothing backs. Each namespace comes
// back with its resource module, in the pass that builds the screen.
export const keys = {
  auth: {
    all: () => ['auth'] as const,
    session: () => ['auth', 'session'] as const,
  },
  orders: {
    all: () => ['orders'] as const,
    view: (id: string) => ['orders', 'view', id] as const,
    spots: (id: string) => ['orders', 'spots', id] as const,
    documents: (id: string) => ['orders', 'documents', id] as const,
    fulfillment: (id: string) => ['orders', 'fulfillment', id] as const,
    shipments: (id: string) => ['orders', 'shipments', id] as const,
    profit: (id: string) => ['orders', 'profit', id] as const,
  },
  refining: {
    all: () => ['refining'] as const,
    view: (id: string) => ['refining', 'view', id] as const,
    lots: (id: string) => ['refining', 'lots', id] as const,
    refiners: () => ['refining', 'refiners'] as const,
  },
  payments: {
    all: () => ['payments'] as const,
    view: (orderId: string) => ['payments', 'view', orderId] as const,
    payTo: (userId: string) => ['payments', 'pay_to', userId] as const,
    candidates: (orderId: string) => ['payments', 'candidates', orderId] as const,
    methods: (direction: string) => ['payments', 'methods', direction] as const,
  },
  fulfillments: {
    all: () => ['fulfillments'] as const,
    methods: (direction: string) => ['fulfillments', 'methods', direction] as const,
  },
  shipping: {
    all: () => ['shipping'] as const,
    tracking: (shipmentId: string) => ['shipping', 'tracking', shipmentId] as const,
    services: () => ['shipping', 'services'] as const,
    packages: () => ['shipping', 'packages'] as const,
    handoffs: () => ['shipping', 'handoffs'] as const,
  },
  spots: {
    all: () => ['spots'] as const,
    live: () => ['spots', 'live'] as const,
  },
  users: {
    all: () => ['users'] as const,
    admins: () => ['users', 'admins'] as const,
    one: (id: string) => ['users', 'one', id] as const,
  },
  crm: {
    all: () => ['crm'] as const,
    timeline: (userId: string) => ['crm', 'timeline', userId] as const,
    conversation: (userId: string) => ['crm', 'conversation', userId] as const,
  },
} as const
