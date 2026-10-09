export const keys = {
  auth: {
    all: () => ['auth'] as const,
    session: () => ['auth', 'session'] as const,
  },
  orders: {
    all: () => ['orders'] as const,
    list: (filters: Record<string, unknown>) => ['orders', 'list', filters] as const,
    view: (id: string) => ['orders', 'view', id] as const,
    spots: (id: string) => ['orders', 'spots', id] as const,
    documents: (id: string) => ['orders', 'documents', id] as const,
    fulfillment: (id: string) => ['orders', 'fulfillment', id] as const,
    shipments: (id: string) => ['orders', 'shipments', id] as const,
    profit: (id: string) => ['orders', 'profit', id] as const,
    sorts: () => ['orders', 'sorts'] as const,
    dropoffs: (id: string) => ['orders', 'dropoffs', id] as const,
  },
  search: {
    all: () => ['search'] as const,
    hits: (q: string) => ['search', 'hits', q] as const,
  },
  refining: {
    all: () => ['refining'] as const,
    list: (refinerId: string | null, direction: string | null, state: string | null) =>
      ['refining', 'list', refinerId, direction, state] as const,
    view: (id: string) => ['refining', 'view', id] as const,
    lots: (id: string) => ['refining', 'lots', id] as const,
    refiners: () => ['refining', 'refiners'] as const,
    spots: (id: string) => ['refining', 'spots', id] as const,
    documents: (id: string) => ['refining', 'documents', id] as const,
    payment: (id: string) => ['refining', 'payment', id] as const,
    pricing: (id: string) => ['refining', 'pricing', id] as const,
    settlementLines: (id: string) => ['refining', 'settlement_lines', id] as const,
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
  lots: {
    all: () => ['lots'] as const,
    search: (q: string, unassigned: boolean) => ['lots', 'search', q, unassigned] as const,
  },
  places: {
    all: () => ['places'] as const,
    locations: () => ['places', 'locations'] as const,
  },
  employees: {
    all: () => ['employees'] as const,
    list: () => ['employees', 'list'] as const,
  },
  crm: {
    all: () => ['crm'] as const,
    timeline: (userId: string) => ['crm', 'timeline', userId] as const,
    conversation: (userId: string) => ['crm', 'conversation', userId] as const,
  },
} as const
