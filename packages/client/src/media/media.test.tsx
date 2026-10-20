import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '../keys'
import { useImageUrl, useUploadImage } from './index'

const IMAGE = '00000000-0000-4000-8000-00000000000c'

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('media keys', () => {
  it('nests an image url under the media root', () => {
    expect(keys.media.all()).toEqual(['media'])
    expect(keys.media.url(IMAGE)).toEqual(['media', 'url', IMAGE])
  })
})

describe('image upload', () => {
  it('registers the image, puts the bytes to the signed url and returns the image id', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/images'))
        return new Response(
          JSON.stringify({ id: IMAGE, uploadUrl: 'https://bucket.example/put?sig=1' }),
          { status: 201 }
        )
      return new Response('', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useUploadImage(), { wrapper: wrapperFor(newClient()) })
    const file = new File(['png'], 'ring.png', { type: 'image/png' })
    const id = await result.result.current.mutateAsync(file)
    expect(id).toBe(IMAGE)

    const [registerUrl, registerInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(registerUrl).toBe('/images')
    expect(registerInit.method).toBe('POST')
    expect(JSON.parse(String(registerInit.body))).toEqual({
      filename: 'ring.png',
      mime_type: 'image/png',
      size_bytes: 3,
    })

    const [putUrl, putInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(putUrl).toBe('https://bucket.example/put?sig=1')
    expect(putInit.method).toBe('PUT')
    expect(putInit.body).toBe(file)
  })

  it('fails when the signed put fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith('/images')
          ? new Response(JSON.stringify({ id: IMAGE, uploadUrl: 'https://b.example/p' }), {
              status: 201,
            })
          : new Response('', { status: 403 })
      )
    )
    const result = renderHook(() => useUploadImage(), { wrapper: wrapperFor(newClient()) })
    await expect(
      result.result.current.mutateAsync(new File(['x'], 'a.png', { type: 'image/png' }))
    ).rejects.toBeTruthy()
  })
})

describe('image url', () => {
  it('reads the signed url of one image', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify('https://img.example/a.jpg'), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = renderHook(() => useImageUrl(IMAGE), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.result.current.isSuccess).toBe(true))
    expect(result.result.current.data).toBe('https://img.example/a.jpg')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/images/${IMAGE}/url`)
    expect(init.method).toBe('GET')
  })

  it('stays idle with no id', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useImageUrl(''), { wrapper: wrapperFor(newClient()) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
