import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { SPOT_POLL_FALLBACK_MS, useSpotStream } from './stream'
import { useLiveSpots } from './queries'

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static last: FakeEventSource | null = null
  url: string
  withCredentials: boolean
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = 2
  })
  private listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>()
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = init?.withCredentials ?? false
    FakeEventSource.last = this
  }
  addEventListener(name: string, fn: (event: MessageEvent<string>) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn])
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  fail(readyState: number) {
    this.readyState = readyState
    this.onerror?.()
  }
  emit(name: string, data: string) {
    for (const fn of this.listeners.get(name) ?? []) fn({ data } as MessageEvent<string>)
  }
}

const board = { spots: [], market_open: true, next_market_open: null, paused: ['gold'] }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children)

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  FakeEventSource.last = null
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource
})

afterEach(() => {
  delete (globalThis as { EventSource?: unknown }).EventSource
})

describe('useSpotStream', () => {
  it('writes a board event into the cache', () => {
    renderHook(() => useSpotStream(), { wrapper })
    const source = FakeEventSource.last!
    expect(source.withCredentials).toBe(true)
    expect(source.url.endsWith('/spots/stream')).toBe(true)
    act(() => source.emit('board', JSON.stringify(board)))
    expect(client.getQueryData(keys.spots.board())).toEqual(board)
  })

  it('moves connecting, open, connecting on error, closed on unmount', async () => {
    const { result, unmount } = renderHook(() => useSpotStream(), { wrapper })
    const source = FakeEventSource.last!
    await waitFor(() => expect(result.current).toBe('connecting'))
    act(() => source.open())
    await waitFor(() => expect(result.current).toBe('open'))
    act(() => source.fail(0))
    await waitFor(() => expect(result.current).toBe('connecting'))
    unmount()
    expect(source.close).toHaveBeenCalled()
    expect(client.getQueryData(keys.spots.stream())).toBe('closed')
  })

  it('keeps the cache when the payload is malformed', () => {
    client.setQueryData(keys.spots.board(), board)
    renderHook(() => useSpotStream(), { wrapper })
    const source = FakeEventSource.last!
    act(() => source.emit('board', '{not json'))
    act(() => source.emit('board', JSON.stringify({ spots: 'nope' })))
    expect(client.getQueryData(keys.spots.board())).toEqual(board)
  })

  it('is closed without EventSource', () => {
    delete (globalThis as { EventSource?: unknown }).EventSource
    const { result } = renderHook(() => useSpotStream(), { wrapper })
    expect(result.current).toBe('closed')
  })
})

describe('useLiveSpots fallback polling', () => {
  it('polls while the stream is not open and stops while it is open', async () => {
    renderHook(() => useSpotStream(), { wrapper })
    const live = renderHook(() => useLiveSpots({ enabled: false }), { wrapper })
    const interval = () =>
      client.getQueryCache().find({ queryKey: keys.spots.board() })?.observers[0]?.options
        .refetchInterval
    await waitFor(() => expect(interval()).toBe(SPOT_POLL_FALLBACK_MS))
    act(() => FakeEventSource.last!.open())
    await waitFor(() => expect(interval()).toBe(false))
    act(() => FakeEventSource.last!.fail(0))
    await waitFor(() => expect(interval()).toBe(SPOT_POLL_FALLBACK_MS))
    live.unmount()
  })
})

describe('useSpotTicker', () => {
  it('reads the stream board when the stream is open and polls at 30 s otherwise', async () => {
    const { useSpotTicker, SPOT_TICKER_POLL_MS } = await import('./queries')
    expect(SPOT_TICKER_POLL_MS).toBe(30_000)
    const client = new QueryClient()
    client.setQueryData(keys.spots.stream(), 'open')
    client.setQueryData(keys.spots.board(), {
      spots: [
        {
          id: 'Gold',
          bid: 10,
          ask: 11,
          percent_change: 1,
          dollar_change: 2,
          updated_at: '2026-01-01T00:00:00Z',
          direction: 'up',
        },
      ],
      paused: [],
      market_open: true,
      next_market_open: null,
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useSpotTicker(), { wrapper })
    expect(result.current.data).toEqual([
      {
        metal_id: 'Gold',
        price: 10,
        percent_change: 1,
        direction: 'up',
        at: '2026-01-01T00:00:00Z',
      },
    ])
  })
})
