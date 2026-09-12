import { Invalid } from '#shared/errors.ts'
import type { ChargePatch } from '@dorado/contracts'

export function assertNamesExactlyOneField(patch: ChargePatch): void {
  const named = Object.values(patch).filter((value) => value !== undefined).length
  if (named === 0) throw new Invalid('the document names no field to write')
  if (named > 1) throw new Invalid('a charge PATCH names exactly one field to write')
}
