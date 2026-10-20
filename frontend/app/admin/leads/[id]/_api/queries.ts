'use client'

import {
  useContactPreferences,
  useEmployees,
  useEstimateItemImages,
  useEstimateItems,
  useEstimateKinds,
  useLead,
  useLeadDocumentKinds,
  useLeadDocuments,
  useLeadEstimate,
  useLeadMessages,
  useLeadSources,
  useLeadTimeline,
  usePurities,
  useWeightUnits,
} from '@dorado/client'

export const useLeadRecord = (id: string) => useLead(id)

export const useItems = (id: string) => useEstimateItems(id)

export const useItemImages = (id: string, itemId: string) => useEstimateItemImages(id, itemId)

export const usePricedEstimate = (id: string, enabled: boolean) => useLeadEstimate(id, { enabled })

export const useKinds = () => useEstimateKinds()

export const useUnits = () => useWeightUnits()

export const usePurityLabels = () => usePurities()

export const useSourceLabels = () => useLeadSources()

export const usePreferenceLabels = () => useContactPreferences()

export const useStaff = () => useEmployees()

export const useTimeline = (id: string) => useLeadTimeline(id)

export const useThread = (id: string, phone: string | null) => useLeadMessages(id, phone)

export const useDocuments = (id: string) => useLeadDocuments(id)

export const useDocumentKinds = () => useLeadDocumentKinds()
