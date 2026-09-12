'use client'

import { useQuery } from '@tanstack/react-query'
import type { EmployeeSummary } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useEmployees(options: { enabled?: boolean } = {}) {
  return useQuery<EmployeeSummary[]>({
    queryKey: keys.employees.list(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<EmployeeSummary[]>('GET', '/employees'),
  })
}
