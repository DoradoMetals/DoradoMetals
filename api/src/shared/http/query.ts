export function oneString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function manyStrings(value: unknown): string[] | null {
  const values = (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string'
  )
  return values.length > 0 ? values : null
}
