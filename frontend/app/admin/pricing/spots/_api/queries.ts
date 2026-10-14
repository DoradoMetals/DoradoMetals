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

import { rangeWindow } from '../_lib'

export { useSpotStream as useLiveBoard }

export const useBoard = () => useSpotBoard()

export const useAdjustments = () => useSpotAdjustments('all')

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
  const candles = useSpotCandles(metalId, '1D').data ?? []
  return {
    data: candles.map((candle) => candle.close),
    domain: rangeWindow(
      '1D',
      Date.now(),
      candles.map((candle) => candle.bucket_start)
    ),
  }
}

export function useHistory(metalId: string, range: SpotCandleRange) {
  const query = useSpotCandles(metalId, range)
  const candles = query.data ?? []
  return {
    closes: candles.map((candle) => candle.close),
    domain: rangeWindow(
      range,
      Date.now(),
      candles.map((candle) => candle.bucket_start)
    ),
    isLoading: query.isLoading,
  }
}

export const useMetal = (metalId: string) => useMetalSpot(metalId)

export const useActivity = (metalId: string) => useMetalActivity(metalId, 7)
