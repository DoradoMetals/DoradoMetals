const STAMPED = new Set([
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'created_by_id',
  'updated_by_id',
])

export type UpdateSpec = {
  table: string
  allowed: readonly string[]
  patch: Record<string, unknown>
  where: Record<string, unknown>
  whereNull?: readonly string[]
  casts?: Record<string, string>
  returning?: string
}

export function buildUpdate(spec: UpdateSpec): { text: string; values: unknown[] } | null {
  const { table, allowed, patch, where, whereNull = [], casts = {}, returning } = spec

  for (const key of Object.keys(patch)) {
    if (STAMPED.has(key)) {
      throw new Error(`${table}: "${key}" is written by the audit_stamp trigger, not by a patch`)
    }
    if (!allowed.includes(key)) {
      throw new Error(`${table}: "${key}" is not a patchable column`)
    }
  }

  const cols = allowed.filter((c) => c in patch && patch[c] !== undefined)
  if (cols.length === 0) return null

  const values: unknown[] = []
  const cast = (col: string): string => (casts[col] ? `::${casts[col]}` : '')
  const bind = (col: string, value: unknown): string => {
    values.push(value)
    return `$${values.length}${cast(col)}`
  }

  const sets = cols.map((c) => `${c} = ${bind(c, patch[c])}`)
  const wheres = [
    ...Object.entries(where).map(([c, v]) => `${c} = ${bind(c, v)}`),
    ...whereNull.map((c) => `${c} IS NULL`),
  ]
  if (wheres.length === 0) {
    throw new Error(`${table}: an UPDATE with no WHERE would rewrite every row`)
  }

  const text =
    `UPDATE ${table} SET ${sets.join(', ')}\n WHERE ${wheres.join(' AND ')}` +
    (returning ? `\n RETURNING ${returning}` : '')

  return { text, values }
}
