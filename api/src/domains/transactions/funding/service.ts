import * as fundingSources from '#db/payments/funding-sources/repo.ts'
import * as rules from '#transactions/funding/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { FundingSource } from '@dorado/contracts'

export async function list(): Promise<FundingSource[]> {
  return await fundingSources.list()
}

export async function assertKnown(id: string, executor?: Executor): Promise<FundingSource> {
  return rules.assertFundingSource(await fundingSources.getOne(id, executor), id)
}
