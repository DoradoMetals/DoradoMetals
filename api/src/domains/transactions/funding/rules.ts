import { Invalid } from '#shared/errors.ts'
import type { FundingSource } from '@dorado/contracts'

export function assertFundingSource(row: FundingSource | undefined, id: string): FundingSource {
  if (!row) throw new Invalid(`no funding source ${id}`)
  return row
}
