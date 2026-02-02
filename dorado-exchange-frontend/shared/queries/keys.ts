import { ProductFilters } from '@/features/products/types'
import {
  ShipmentTrackingInput,
  ShippingLocationsInput,
  ShippingPickupTimesInput,
  ShippingRatesInput,
  ShippingValidateAddressInput,
} from '@/features/shipping/types'
import { PlacesSuggestionsInput } from '@/features/addresses/types'
import { SalesTaxInput } from '@/features/sales-tax/types'

export const queryKeys = {
  //Auctions
  auctions: () => ['auctions'] as const,
  auction: (id: string) => ['auctions', id] as const,
  auctionItems: (auctionId: string) => ['auctions', auctionId, 'items'] as const,
  auctionCurrentLot: (auction_id: string) => ['auctions', 'current_lot', auction_id],

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
  adminLead: (id: string) => ['lead', id] as const,

  // Addresses
  address: () => ['address'] as const,
  userAddresses: (userId: string) => ['address', userId] as const,
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

  // Carriers
  carrier: (carrier_id: string) => ['carrier', carrier_id] as const,
  carriers: () => ['carriers'] as const,
  carrierService: (service_id: string) => ['carrierService', service_id] as const,
  carrierServices: () => ['carrierServices'] as const,
  carrierServicesByCarrier: (carrier_id: string) =>
    ['carrierServices', 'carrier', carrier_id] as const,

  // Images
  images: () => ['images'] as const,
  image: (id: string) => ['images', id] as const,
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
  rate: (id: string) => ['rate', id] as const,
  rates: () => ['rates'] as const,
  adminRates: () => ['adminRates'] as const,

  // Reviews
  review: (id: string) => ['review', id] as const,
  reviews: () => ['reviews'] as const,
  publicReviews: () => ['publicReviews'] as const,

  // Sales Orders
  adminSalesOrders: () => ['adminSalesOrders'] as const,
  salesOrders: () => ['salesOrders'] as const,
  salesOrderMetals: (id: string) => ['salesOrderMetals', id] as const,

  // Sales Tax
  salesTax: (input: SalesTaxInput) => ['salesTax', input] as const,

  // Shipments
  shipmentTracking: (input: ShipmentTrackingInput) => ['shipmentTracking', input] as const,

  // Payment Intents
  paymentIntent: () => ['paymentIntent'] as const,
  adminPaymentIntent: (salesOrderId: string) => ['adminPaymentIntent', salesOrderId] as const,
}
