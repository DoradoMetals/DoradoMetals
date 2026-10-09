import * as timelineRepo from '#db/crm/timeline/repo.ts'
import type { CustomerTimeline, LeadTimeline } from '@dorado/contracts'

export async function forCustomer(user_id: string): Promise<CustomerTimeline[]> {
  return timelineRepo.forCustomer(user_id)
}

export async function forLead(lead_id: string): Promise<LeadTimeline[]> {
  return timelineRepo.forLead(lead_id)
}
