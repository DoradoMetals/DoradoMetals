export function oneString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
