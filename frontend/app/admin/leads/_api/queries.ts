'use client'

import {
  useEmployees,
  useLeadActivity,
  useLeadAssignees,
  useLeadEstimateTotals,
  useLeadSources,
  useLeadSummary,
  useLeads,
  useContactPreferences,
  type LeadListFilters,
} from '@dorado/client'
import type { LeadSummaryWindow } from '@dorado/contracts'

export const useLeadList = (filters: LeadListFilters) => useLeads(filters)

export const useSummary = (window: LeadSummaryWindow) => useLeadSummary(window)

export const usePricedTotals = (leadIds: readonly string[]) => useLeadEstimateTotals(leadIds)

export const useSources = () => useLeadSources()

export const usePreferences = () => useContactPreferences()

export const useStaff = () => useEmployees()

export const useAssigneeLoads = (enabled: boolean) => useLeadAssignees({ enabled })

export const useActivityFeed = () => useLeadActivity({ limit: 20 })
