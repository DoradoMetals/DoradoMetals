export const NATIVE_SCHEMAS = [
  'auth',
  'checkout',
  'crm',
  'fulfillments',
  'inventory',
  'leads',
  'media',
  'metals',
  'orders',
  'organizations',
  'payments',
  'places',
  'products',
  'rates',
  'refiners',
  'refining',
  'reviews',
  'shipping',
  'spots',
  'tax',
]

/**
 * Schemas that are never dropped, whatever the catalogue says, and never
 * counted as a native schema either. `exchange` is first for a reason: it is
 * the covenant. `scripts/reset-january.ts` computes its drop list as
 * pg_namespace MINUS this set, so a name here cannot reach a DROP SCHEMA.
 */
export const PROTECTED_SCHEMAS = Object.freeze(['exchange', 'public', 'information_schema'])

/** Prefixes Postgres owns. Everything under them is the server's, not ours. */
export const PROTECTED_SCHEMA_PREFIXES = Object.freeze(['pg_'])

export function isProtectedSchema(name: string): boolean {
  return (
    PROTECTED_SCHEMAS.includes(name) || PROTECTED_SCHEMA_PREFIXES.some((p) => name.startsWith(p))
  )
}

/**
 * Every schema present that is not protected. A subtraction rather than an
 * allowlist, because an allowlist goes stale the moment production turns out
 * to hold a schema nobody listed - `core` and `auctions` are exactly that.
 */
export function droppableSchemas(present: readonly string[]): string[] {
  return present.filter((s) => !isProtectedSchema(s)).sort()
}

const IGNORED = new Set(PROTECTED_SCHEMAS)

export function unknownSchemas(present: string[]): string[] {
  const known = new Set(NATIVE_SCHEMAS)
  return present.filter(
    (s) => !s.startsWith('pg_') && !s.startsWith('zz_') && !IGNORED.has(s) && !known.has(s)
  )
}

type RowFetcher = (sql: string) => Promise<{ nspname: string }[]>

export async function assertSchemasComplete(fetchRows: RowFetcher): Promise<void> {
  const rows = await fetchRows('SELECT nspname FROM pg_namespace')
  const unknown = unknownSchemas(rows.map((r) => r.nspname))
  if (unknown.length) {
    throw new Error(
      `NATIVE_SCHEMAS (api/scripts/lib/schemas.ts) does not list: ${unknown.join(', ')}`
    )
  }
}
