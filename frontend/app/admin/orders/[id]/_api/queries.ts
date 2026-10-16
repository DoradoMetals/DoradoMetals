'use client'

import {
  useAddressBook,
  useAdoptAssayProposal,
  useCarrierServices,
  useEmployees,
  useFulfillmentMethods,
  useHandoffs,
  useLocations,
  useMatchCandidates,
  usePackages,
  useLiveSpots,
  useLotImages,
  useOrder,
  useOrderActivity,
  useOrderClaims,
  useOrderDisputes,
  useOrderFulfillment,
  useOrderNotes,
  useOrderPricing,
  useOrderRefunds,
  useOrderShipments,
  usePaymentMethods,
  usePaymentView,
  usePayTo,
  useProfitBreakdown,
  useSession,
  useStockLotSearch,
  useUserNames,
} from '@dorado/client'
import type { Direction } from '@dorado/contracts'

export const ACTIVITY_PAGE = 50

type Read = { isPending: boolean; isError: boolean; data?: unknown }

export type ReadContent = 'loaded' | 'loading' | 'error'

export const contentOf = (read: Read): ReadContent =>
  read.isError ? 'error' : read.isPending && read.data === undefined ? 'loading' : 'loaded'

const is = (direction: Direction | null | undefined, wanted: Direction) => direction === wanted

export const useOrderDetail = (id: string) => useOrder(id)

export const useDetailPricing = (id: string) => useOrderPricing(id)

export const useDetailProfit = (id: string, direction: Direction | null | undefined) =>
  useProfitBreakdown(id, { enabled: is(direction, 'purchase') })

export const useDetailActivity = (id: string) => useOrderActivity(id, { limit: ACTIVITY_PAGE })

export const useDetailNotes = (id: string) => useOrderNotes(id)

export const useDetailDisputes = (id: string, direction: Direction | null | undefined) =>
  useOrderDisputes(id, { enabled: is(direction, 'purchase') })

export const useDetailRefunds = (id: string, direction: Direction | null | undefined) =>
  useOrderRefunds(id, { enabled: is(direction, 'sale') })

export const useDetailClaims = (id: string, direction: Direction | null | undefined) =>
  useOrderClaims(id, { enabled: is(direction, 'sale') })

export const useDetailPayment = (id: string) => usePaymentView(id)

export const useDetailShipments = (id: string) => useOrderShipments(id)

export const useDetailFulfillment = (id: string) => useOrderFulfillment(id)

export const useCustomerAddresses = (
  userId: string | null,
  direction: Direction | null | undefined
) => useAddressBook(userId, { enabled: is(direction, 'sale') })

export const useMethodsFor = (direction: Direction | null | undefined) =>
  usePaymentMethods(direction ?? 'purchase', { enabled: direction != null })

export const usePayToFor = (userId: string | null, direction: Direction | null | undefined) =>
  usePayTo(userId, { enabled: is(direction, 'purchase') })

export const useAdoptCandidates = (id: string, open: boolean) =>
  useAdoptAssayProposal(id, { enabled: open })

export const useLotPictures = (lotId: string) => useLotImages(lotId)

export const useActorNames = (ids: readonly (string | null | undefined)[]) => useUserNames(ids)

export const useAdminSession = () => useSession()

export const useStockLots = (query: string, direction: Direction | null | undefined) =>
  useStockLotSearch(query, { enabled: is(direction, 'sale') })

export const useDeclareMetals = (open: boolean) => useLiveSpots({ enabled: open })

export const useOrderBook = (userId: string | null) => useAddressBook(userId)

export const useOffices = (enabled: boolean) => useLocations({ enabled })

export const useStaff = (enabled: boolean) => useEmployees({ enabled })

export const useCreateMethods = (direction: Direction | null | undefined, enabled: boolean) =>
  useFulfillmentMethods(direction ?? 'purchase', { enabled: enabled && direction != null })

export const useParcelOptions = (enabled: boolean) => ({
  services: useCarrierServices({ enabled }),
  packages: usePackages({ enabled }),
  handoffs: useHandoffs({ enabled }),
})

export const useMatchesFor = (id: string, enabled: boolean) => useMatchCandidates(id, { enabled })
