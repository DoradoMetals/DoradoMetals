'use client'

import { useQuery } from '@tanstack/react-query'
import type { EmployeeSummary } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

// Who can drive a pickup or take an appointment. The row carries the name, so
// no screen turns an id into one.
export function useEmployees(options: { enabled?: boolean } = {}) {
  return useQuery<EmployeeSummary[]>({
    queryKey: keys.employees.list(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<EmployeeSummary[]>('GET', '/employees'),
  })
}
