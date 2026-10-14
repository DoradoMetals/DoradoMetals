'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SpotBoard } from '@dorado/contracts'

import { baseUrl } from '../fetch'
import { keys } from '../keys'

export type SpotStreamState = 'connecting' | 'open' | 'closed'

export const SPOT_POLL_FALLBACK_MS = 60_000

const STREAM_PATH = '/spots/stream'

export function useSpotStreamState(): SpotStreamState {
  const client = useQueryClient()
  const { data } = useQuery<SpotStreamState>({
    queryKey: keys.spots.stream(),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: 'closed',
    queryFn: () => client.getQueryData<SpotStreamState>(keys.spots.stream()) ?? 'closed',
  })
  return data
}

export function spotPollInterval(state: SpotStreamState): number | false {
  return state === 'open' ? false : SPOT_POLL_FALLBACK_MS
}

export function useSpotStream(): SpotStreamState {
  const client = useQueryClient()
  const state = useSpotStreamState()

  useEffect(() => {
    const setState = (next: SpotStreamState) =>
      client.setQueryData<SpotStreamState>(keys.spots.stream(), next)

    if (typeof EventSource === 'undefined') {
      setState('closed')
      return
    }

    setState('connecting')
    const source = new EventSource(`${baseUrl()}${STREAM_PATH}`, { withCredentials: true })

    source.onopen = () => setState('open')
    source.onerror = () =>
      setState(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting')
    source.addEventListener('board', (event) => {
      let json: unknown
      try {
        json = JSON.parse((event as MessageEvent<string>).data)
      } catch {
        return
      }
      const parsed = SpotBoard.safeParse(json)
      if (parsed.success) client.setQueryData(keys.spots.board(), parsed.data)
    })

    return () => {
      source.close()
      setState('closed')
    }
  }, [client])

  return state
}
