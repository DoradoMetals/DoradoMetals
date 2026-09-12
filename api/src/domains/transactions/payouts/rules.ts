import { Invalid } from '#shared/errors.ts'
import type { PayoutPatch } from '@dorado/contracts'

export function assertNamesExactlyOneField(patch: PayoutPatch): void {
  const named = Object.values(patch).filter((value) => value !== undefined).length
  if (named === 0) throw new Invalid('the document names no field to write')
  if (named > 1) throw new Invalid('a payout PATCH names exactly one field to write')
}
