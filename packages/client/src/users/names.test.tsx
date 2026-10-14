import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { userNameIds, userNamesKey, useUserNames } from './queries'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

const respond = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the user-names key', () => {
  it('sorts, dedupes and drops empty ids', () => {
    expect(userNameIds([B, null, A, B, undefined, ''])).toEqual([A, B])
  })

  it('is the same key whatever order the screen lists the ids in', () => {
    expect(userNamesKey([B, A, B])).toEqual(userNamesKey([A, B]))
    expect(userNamesKey([A, B])).toEqual(keys.users.names([A, B]))
  })
})

describe('useUserNames', () => {
  it('makes one call for the ids on screen and serves a reordered list from the cache', async () => {
    const fetchMock = respond([
      { id: A, name: 'Ann' },
      { id: B, name: 'Bo' },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const first = renderHook(() => useUserNames([B, A, B, null]), {
      wrapper: wrapperFor(client),
    })
    await waitFor(() => expect(first.result.current.data).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(decodeURIComponent(url)).toContain(`/users/names?ids=${A},${B}`)

    const second = renderHook(() => useUserNames([A, B]), { wrapper: wrapperFor(client) })
    expect(second.result.current.data).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes no call when no id is on screen', () => {
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    renderHook(() => useUserNames([null, undefined]), { wrapper: wrapperFor(client) })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('splits more than 200 ids into batches the endpoint accepts', async () => {
    const ids = Array.from(
      { length: 201 },
      (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    )
    const fetchMock = respond([])
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const hook = renderHook(() => useUserNames([...ids, C]), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
