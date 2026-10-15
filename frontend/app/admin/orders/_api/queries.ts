'use client'

import {
  useConversation,
  useCustomerTimeline,
  useEmployees,
  useLotImages,
  useLocations,
  useOrder,
  useOrderDocuments,
  useOrders,
  useOrderSorts,
  useRefiners,
  useSearch,
  useSelectionSummary,
  type OrderListFilters,
} from '@dorado/client'

export const useOrderList = (filters: OrderListFilters) => useOrders(filters)

export const useSortOptions = () => useOrderSorts()

export const useAssignees = () => useEmployees()

export const useRefinerOptions = () => useRefiners()

export const useRefinerLocations = () => useLocations()

export const useOrderSearch = (q: string) => useSearch(q)

export const useSelection = (orderIds: string[]) => useSelectionSummary(orderIds)

export const useOrderHeader = (id: string) => useOrder(id)

export const useDocuments = (id: string) => useOrderDocuments(id)

export const useThread = (userId: string | null) => useConversation(userId)

export const useCalls = (userId: string | null) => useCustomerTimeline(userId)

export const useLotPhotos = (lotId: string) => useLotImages(lotId)
