export const CUSTOMER_LANDING = '/'
export const ADMIN_LANDING = '/admin'

const NEVER = ['/auth', '/api']

export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  if (NEVER.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) return null
  return value
}

export const nextFrom = (params: { get: (key: string) => string | null }): string | null =>
  safeNext(params.get('next'))

export const landingFor = (role: string | null | undefined, next?: string | null): string =>
  safeNext(next) ?? (role === 'admin' ? ADMIN_LANDING : CUSTOMER_LANDING)

export function signInHref(from: string | null | undefined, base = '/auth/sign-in'): string {
  const next = safeNext(from)
  return next ? `${base}?next=${encodeURIComponent(next)}` : base
}
