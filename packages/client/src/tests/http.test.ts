import { describe, expect, test, afterEach } from 'vitest'
import { ApiError, apiRequest } from '../fetch'
import { keys } from '../keys'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

let lastUrl: string | null = null

function answers(status: number, body: string | null, contentType = 'application/json') {
  lastUrl = null
  globalThis.fetch = (async (url: string) => {
    lastUrl = String(url)
    return new Response(body, { status, headers: { 'Content-Type': contentType } })
  }) as unknown as typeof fetch
}

describe('apiRequest', () => {
  test('puts params in the query string and drops absent ones', async () => {
    answers(200, '[]')
    await apiRequest('GET', '/checkout/items', undefined, {
      direction: 'sale',
      user_id: undefined,
    })
    expect(lastUrl?.endsWith('/checkout/items?direction=sale')).toBe(true)
  })

  test('an empty body is null rather than a JSON parse error', async () => {
    answers(204, null)
    await expect(apiRequest('DELETE', '/checkout/items')).resolves.toBeNull()
  })

  test("a refusal throws ApiError carrying the server's message and status", async () => {
    answers(422, JSON.stringify({ message: 'a line with no product needs purity' }))
    await expect(apiRequest('PUT', '/checkout/items')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'a line with no product needs purity',
    })
  })

  test('a failure with no message names the call and the status', async () => {
    answers(502, JSON.stringify({}))
    const error = await apiRequest('GET', '/checkout').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).message).toContain('502')
  })
})

describe('keys', () => {
  test('the two directions never share an entry', () => {
    expect(keys.checkout.row('sale')).not.toEqual(keys.checkout.row('purchase'))
    expect(keys.checkout.items('sale')).not.toEqual(keys.checkout.items('purchase'))
  })

  test("a rates key carries the parcel's facts, so a new box is a new question", () => {
    expect(keys.fulfillments.rates('f1', 'a', 'b')).not.toEqual(
      keys.fulfillments.rates('f1', 'a', 'c')
    )
    expect(keys.fulfillments.rates('f1', 'a', 'b')).not.toEqual(
      keys.fulfillments.rates('f2', 'a', 'b')
    )
  })

  test('checkout keys do not collide with the orders prefix', () => {
    expect(keys.checkout.row('sale')[0]).toBe('checkout')
    expect(keys.orders.all()[0]).toBe('orders')
  })
})
