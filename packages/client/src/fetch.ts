export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const baseUrl = (): string =>
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || ''

const withQuery = (url: string, params?: Record<string, unknown>): string => {
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url
}

export async function apiRequest<T>(
  method: ApiMethod,
  url: string,
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${baseUrl()}${withQuery(url, params)}`, {
    method,
    credentials: 'include',
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })

  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : null) ?? `${method} ${url} failed with ${response.status}`
    throw new ApiError(response.status, message, body)
  }
  return body as T
}

export async function apiRequestBlob(
  method: ApiMethod,
  url: string,
  data?: unknown
): Promise<Blob> {
  const response = await fetch(`${baseUrl()}${url}`, {
    method,
    credentials: 'include',
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  if (!response.ok) {
    throw new ApiError(response.status, `${method} ${url} failed with ${response.status}`, null)
  }
  return response.blob()
}
