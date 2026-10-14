'use client'

import {
  useMetalActivity,
  useMetalSpot,
  useSpotAdjustments,
  useSpotBoard,
  useSpotCandles,
  useSpotLocks,
  useSpotSources,
  useSpotStream,
} from '@dorado/client'
import type { SpotCandleRange, SpotLockStatus, SpotSourceRead } from '@dorado/contracts'

import { candleLabel } from '../../_lib'

export { useSpotStream as useLiveBoard }

export const useBoard = () => useSpotBoard()

export const useAdjustments = () => useSpotAdjustments()

export function useSources() {
  const query = useSpotSources()
  const sources: SpotSourceRead[] | undefined = query.data
    ? [...query.data].sort((a, b) => a.sort_order - b.sort_order)
    : undefined
  return { ...query, data: sources }
}

export function useLocks(filters: {
  metal: string | null
  status: SpotLockStatus | null
  q: string | null
  page: number
}) {
  return useSpotLocks(filters)
}

export function useSparkline(metalId: string) {
  const query = useSpotCandles(metalId, '1D')
  return query.data?.map((candle) => candle.close) ?? []
}

export function useHistory(metalId: string, range: SpotCandleRange) {
  const query = useSpotCandles(metalId, range)
  const candles = query.data ?? []
  return {
    labels: candles.map((candle) => candleLabel(candle.bucket_start, range)),
    closes: candles.map((candle) => candle.close),
    isLoading: query.isLoading,
  }
}

export const useMetal = (metalId: string) => useMetalSpot(metalId)

export const useActivity = (metalId: string) => useMetalActivity(metalId, 7)
