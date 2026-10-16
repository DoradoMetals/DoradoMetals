'use client'

import {
  useEmployees,
  useLocations,
  useLotSearch,
  useRefiners,
  useRefiningDocuments,
  useRefiningOrder,
  useRefiningPricing,
  useRefiningSpots,
  useSettlementParse,
} from '@dorado/client'

export const useRefinerOrder = (id: string) => useRefiningOrder(id)

export const useRefinerPricing = (id: string) => useRefiningPricing(id)

export const useRefinerSpots = (id: string, enabled = true) => useRefiningSpots(id, { enabled })

export const useRefinerDocuments = (id: string) => useRefiningDocuments(id)

export const useRefinerOptions = () => useRefiners()

export const useRefinerLocations = (organizationId: string | null) =>
  useLocations({ organization_id: organizationId, enabled: organizationId !== null })

export const useAssignees = () => useEmployees()

export const useLotPicker = (q: string) => useLotSearch(q, true)

export const useStatementLines = (id: string, enabled: boolean) =>
  useSettlementParse(id, { enabled })
