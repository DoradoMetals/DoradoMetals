import * as timelineRepo from '#db/crm/timeline/repo.ts'
import type { CustomerTimeline } from '@dorado/contracts'

export async function forCustomer(user_id: string): Promise<CustomerTimeline[]> {
  return timelineRepo.forCustomer(user_id)
}
