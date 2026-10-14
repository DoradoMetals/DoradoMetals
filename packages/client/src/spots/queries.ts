'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ActiveSpotSourcePatch,
  MetalSpot,
  SpotActivity,
  SpotAdjustmentChangeRead,
  SpotAdjustmentPatch,
  SpotAdjustmentRead,
  SpotBoard,
  SpotFreezeBody,
  SpotLock,
  SpotLockPage,
  SpotLockStatus,
  SpotPrice,
  SpotSettings,
  SpotSettingsPatch,
  SpotSourcePatch,
  SpotSourceRead,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

const board = () => apiRequest<SpotBoard>('GET', '/spots')

export function useSpotBoard(options: { enabled?: boolean } = {}) {
  return useQuery<SpotBoard>({
    queryKey: keys.spots.board(),
    enabled: options.enabled ?? true,
    queryFn: board,
  })
}

export function useLiveSpots(options: { enabled?: boolean } = {}) {
  return useQuery<SpotBoard, Error, SpotPrice[]>({
    queryKey: keys.spots.board(),
    enabled: options.enabled ?? true,
    queryFn: board,
    select: (data) => data.spots,
  })
}

export function useSpotSources(options: { enabled?: boolean } = {}) {
  return useQuery<SpotSourceRead[]>({
    queryKey: keys.spots.sources(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotSourceRead[]>('GET', '/spots/sources'),
  })
}

export function useMetalSpot(metalId: string, options: { enabled?: boolean } = {}) {
  return useQuery<MetalSpot>({
    queryKey: keys.spots.metal(metalId),
    enabled: (options.enabled ?? true) && metalId.length > 0,
    queryFn: () => apiRequest<MetalSpot>('GET', `/spots/metals/${encodeURIComponent(metalId)}`),
  })
}

export function useMetalActivity(metalId: string, days = 7, options: { enabled?: boolean } = {}) {
  return useQuery<SpotActivity[]>({
    queryKey: keys.spots.activity(metalId, days),
    enabled: (options.enabled ?? true) && metalId.length > 0,
    queryFn: () =>
      apiRequest<SpotActivity[]>(
        'GET',
        `/spots/metals/${encodeURIComponent(metalId)}/activity`,
        undefined,
        { days }
      ),
  })
}

export function useSpotAdjustments(options: { enabled?: boolean } = {}) {
  return useQuery<SpotAdjustmentRead[]>({
    queryKey: keys.spots.adjustments(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotAdjustmentRead[]>('GET', '/spots/adjustments'),
  })
}

export function useAdjustmentHistory(
  days = 30,
  metalId: string | null = null,
  options: { enabled?: boolean } = {}
) {
  return useQuery<SpotAdjustmentChangeRead[]>({
    queryKey: keys.spots.history(days, metalId),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<SpotAdjustmentChangeRead[]>('GET', '/spots/adjustments/history', undefined, {
        days,
        metal_id: metalId,
      }),
  })
}

export function useSpotLocks(
  filters: {
    metal?: string | null
    status?: SpotLockStatus | null
    q?: string | null
    page?: number
  } = {},
  options: { enabled?: boolean } = {}
) {
  const params = {
    metal: filters.metal ?? null,
    status: filters.status ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
  }
  return useQuery<SpotLockPage>({
    queryKey: keys.spots.locks(params),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotLockPage>('GET', '/spots/locks', undefined, params),
  })
}

export function useSpotSettings(options: { enabled?: boolean } = {}) {
  return useQuery<SpotSettings>({
    queryKey: keys.spots.settings(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotSettings>('GET', '/spots/settings'),
  })
}

function useSpotWrite<TVariables, TResult>(run: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.spots.all() })
      client.invalidateQueries({ queryKey: keys.rates.all() })
    },
  })
}

export function useUpdateSpotSource(id: string) {
  return useSpotWrite((patch: SpotSourcePatch) =>
    apiRequest<SpotSourceRead>('PATCH', `/spots/sources/${encodeURIComponent(id)}`, patch)
  )
}

export function useSetMetalSource(metalId: string) {
  return useSpotWrite((patch: ActiveSpotSourcePatch) =>
    apiRequest<MetalSpot>('PATCH', `/spots/metals/${encodeURIComponent(metalId)}/source`, patch)
  )
}

export function useSetAdjustment(metalId: string, sourceId: string) {
  return useSpotWrite((patch: SpotAdjustmentPatch) =>
    apiRequest<SpotAdjustmentRead>(
      'PATCH',
      `/spots/adjustments/${encodeURIComponent(metalId)}/${encodeURIComponent(sourceId)}`,
      patch
    )
  )
}

export function useRemoveAdjustment(metalId: string, sourceId: string) {
  return useSpotWrite(() =>
    apiRequest<void>(
      'DELETE',
      `/spots/adjustments/${encodeURIComponent(metalId)}/${encodeURIComponent(sourceId)}`
    )
  )
}

export function useCancelAdjustment(metalId: string) {
  return useSpotWrite(() =>
    apiRequest<void>('DELETE', `/spots/adjustments/${encodeURIComponent(metalId)}`)
  )
}

export function useFreezeAll() {
  return useSpotWrite((body: SpotFreezeBody) =>
    apiRequest<SpotBoard>('POST', '/spots/freeze', body)
  )
}

export function useUnlockSpotLock() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiRequest<SpotLock>('POST', `/spots/locks/${id}/unlock`),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.spots.all() })
      client.invalidateQueries({ queryKey: keys.orders.all() })
    },
  })
}

export function useRefreshSpots() {
  return useSpotWrite(() => apiRequest<SpotBoard>('POST', '/spots/refresh'))
}

export function useUpdateSpotSettings() {
  return useSpotWrite((patch: SpotSettingsPatch) =>
    apiRequest<SpotSettings>('PATCH', '/spots/settings', patch)
  )
}
