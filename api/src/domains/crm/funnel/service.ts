import * as funnel from '#db/leads/funnel/repo.ts'
import type { LeadFunnel } from '@dorado/contracts'

export async function get(): Promise<LeadFunnel> {
  return await funnel.get()
}
