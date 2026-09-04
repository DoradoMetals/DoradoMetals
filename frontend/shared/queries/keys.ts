import { ProductFilters } from '@/features/products/types'

export const queryKeys = {
  // Admin Inventory
  adminSuppliers: () => ['adminSuppliers'] as const,
  adminCarriers: () => ['adminCarriers'] as const,

  // Admin Users
  adminUser: (id: string) => ['adminUser', id] as const,
  adminAllUsers: () => ['adminAllUsers'] as const,
  adminRoleUsers: () => ['adminRoleUsers'] as const,

  // Admin Leads
  adminLeads: () => ['leads'] as const,

  // Addresses
  address: () => ['address'] as const,
  userAddresses: (userId: string) => ['address', userId] as const,
  userAddressLinks: () => ['address', 'links'] as const,
  catalogQuote: (items: unknown, side: string) => ['quote', 'catalog', side, JSON.stringify(items)] as const,
  salesOrderQuote: (body: unknown) => ['quote', 'sales_order', JSON.stringify(body)] as const,
  // The deductions are part of the key, not just the body. A quote priced
  // with one shipping service is a DIFFERENT quote from the same items
  // priced with another, and keying on items alone serves the first one
  // from cache after the customer changes their choice - a stale payout
  // figure on the confirm screen, which is the defect D97 is about.
  purchaseOrderQuote: (items: unknown, deductions: unknown = {}) =>
    ['quote', 'purchase_order', JSON.stringify(items), JSON.stringify(deductions)] as const,
  // One EXISTING order's server-priced estimate; orderQuotes is the prefix
  // mutations invalidate - only actively-mounted drawers refetch.
  orderQuote: (order_id: string) => ['quote', 'order', order_id] as const,
  orderQuotes: () => ['quote', 'order'] as const,
  // Under the orderQuotes prefix on purpose: the breakdown reprices off the
  // same inputs, so the same invalidations refresh it.
  profitBreakdown: (order_id: string) => ['quote', 'order', order_id, 'profit'] as const,
  userAddressLinksFor: (userId: string) => ['address', 'links', userId] as const,

  // THE SHIPPING KEYS MOVED TO @dorado/client (src/keys.ts, `keys.shipping`
  // and `keys.fulfillments`) with the hooks that own them - a key and the read
  // it invalidates belong in one file.
  paymentMethods: (direction: string) => ['payments', 'methods', direction] as const,

  // Carriers
  carriers: () => ['carriers'] as const,
  carrierServices: () => ['carrierServices'] as const,
  carrierServicesByCarrier: (carrier_id: string) =>
    ['carrierServices', 'carrier', carrier_id] as const,

  // Images
  images: () => ['images'] as const,
  testImage: () => ['testImage'] as const,

  // Reviews
  reviews: () => ['reviews'] as const,
  publicReviews: () => ['publicReviews'] as const,

  // Sales Orders
  adminSalesOrders: () => ['adminSalesOrders'] as const,
  salesOrders: () => ['salesOrders'] as const,

  // Sales Tax

  // Payment Intents
  paymentIntent: () => ['paymentIntent'] as const,
  adminPaymentIntent: (orderId: string) => ['adminPaymentIntent', orderId] as const,
}
