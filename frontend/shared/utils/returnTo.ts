// WHERE A SIGN-IN GOES BACK TO (Jacob, 2026-09-11: "sign in should redirect to
// previous page after success").
//
// The path travels on the URL as `?next=`, survives the code screen inside the
// verification in flight, and is applied once the code is accepted. It is
// attacker-supplied BY CONSTRUCTION - anyone can put anything in a query string
// and mail the link to a customer - so only a same-origin RELATIVE path is ever
// honoured: one leading slash, no scheme, no host, nothing a browser would read
// as another site. Anything else is dropped and the default landing is used,
// which is a redirect that goes somewhere dull rather than an error to read.

// A customer's landing when nothing asked for a particular page, and an
// admin's. The role comes off the session the accepted code just minted.
//
// A CUSTOMER LANDS ON THE HOME PAGE, not on an account page: the customer
// portal is a later design and `/account` does not exist (Jacob, 2026-09-11).
// `/admin` does - the navigation lane built it - so an admin lands there.
export const CUSTOMER_LANDING = '/'
export const ADMIN_LANDING = '/admin'

// Returning INTO the auth flow would loop, and `/api/**` is not a page.
const NEVER = ['/auth', '/api']

export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null // an absolute URL, or a bare word
  if (value.startsWith('//')) return null // protocol-relative: //evil.example
  if (value.includes('\\')) return null // backslashes some parsers read as /
  if (/[\u0000-\u001f\u007f]/.test(value)) return null // control characters
  if (NEVER.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) return null
  return value
}

export const nextFrom = (params: { get: (key: string) => string | null }): string | null =>
  safeNext(params.get('next'))

// Where the flow lands: what was asked for, else the role's own home.
export const landingFor = (role: string | null | undefined, next?: string | null): string =>
  safeNext(next) ?? (role === 'admin' ? ADMIN_LANDING : CUSTOMER_LANDING)

// The link or redirect that SENDS somebody to sign in, carrying where they were.
export function signInHref(from: string | null | undefined, base = '/auth/sign-in'): string {
  const next = safeNext(from)
  return next ? `${base}?next=${encodeURIComponent(next)}` : base
}
