'use client'

import { useAdminRates, useRateChanges, useRatePay } from '@dorado/client'

export const useBands = (unit: string) => useRatePay(unit)

export const useChanges = (q: string | null, page: number) => useRateChanges({ q, page })

export const useRateRows = () => useAdminRates()
