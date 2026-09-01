import { ProductFilters } from '@/features/products/types'
import {
  ShipmentTrackingInput,
  ShippingLocationsInput,
  ShippingPickupTimesInput,
  ShippingRatesInput,
  ShippingValidateAddressInput,
} from '@/features/shipping/types'
import { PlacesSuggestionsInput } from '@/features/addresses/types'

export const queryKeys = {
  // Admin Products and Inventory
  adminProducts: () => ['adminProducts'] as const,
  adminMetals: () => ['adminMetals'] as const,
  adminSuppliers: () => ['adminSuppliers'] as const,
  adminCarriers: () => ['adminCarriers'] as const,
  adminMints: () => ['adminMints'] as const,
  adminTypes: () => ['adminTypes'] as const,

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
  places: (input: PlacesSuggestionsInput) => ['places', input] as const,

  // Shipping
  shippingRates: (input: ShippingRatesInput) => ['shipping', 'rates', input] as const,
  shippingPickupTimes: (input: ShippingPickupTimesInput) =>
    ['shipping', 'pickup-times', input] as const,
  shippingLocations: (input: ShippingLocationsInput) => ['shipping', 'locations', input] as const,
  shippingValidateAddress: (input: ShippingValidateAddressInput) =>
    ['shipping', 'validate-address', input] as const,
  shippingCancelLabel: () => ['shipping', 'cancel-label'] as const,
  shippingCancelPickup: () => ['shipping', 'cancel-pickup'] as const,

  // THE CARRIER'S OWN VOCABULARY, WHICH THE FRONTEND NO LONGER SPELLS.
  // Reference reads, cached like every other reference list: the components
  // render `name` and map ids back. No carrier id in either key, because the
  // server resolves which carrier it ships with.
  carrierHandoffs: () => ['shipping', 'handoffs'] as const,
  carrierServiceOptions: () => ['shipping', 'service-options'] as const,
  saleShippingServices: () => ['shipping', 'sale-services'] as const,
  paymentMethods: (direction: string) => ['payments', 'methods', direction] as const,

  // Carriers
  carriers: () => ['carriers'] as const,
  carrierServices: () => ['carrierServices'] as const,
  carrierServicesByCarrier: (carrier_id: string) =>
    ['carrierServices', 'carrier', carrier_id] as const,

  // Images
  images: () => ['images'] as const,
  testImage: () => ['testImage'] as const,

  // Spots
  spotPrices: () => ['spotPrices'] as const,

  // Products
  productsRaw: () => ['products'] as const,
  productFromSlug: (slug: string) => ['productFromSlug', slug] as const,
  allProducts: () => ['allProducts'] as const,
  sellProducts: () => ['sellProducts'] as const,
  homepageProducts: () => ['homepage_products'] as const,
  filteredProducts: (filters: ProductFilters) => ['products', filters] as const,

  // Rates
  rates: () => ['rates'] as const,
  adminRates: () => ['adminRates'] as const,

  // Reviews
  reviews: () => ['reviews'] as const,
  publicReviews: () => ['publicReviews'] as const,

  // Sales Orders
  adminSalesOrders: () => ['adminSalesOrders'] as const,
  salesOrders: () => ['salesOrders'] as const,

  // Sales Tax

  // Shipments
  shipmentTracking: (input: ShipmentTrackingInput) => ['shipmentTracking', input] as const,

  // Payment Intents
  paymentIntent: () => ['paymentIntent'] as const,
  adminPaymentIntent: (salesOrderId: string) => ['adminPaymentIntent', salesOrderId] as const,
}
