import * as activity from '#db/crm/activity/repo.ts'
import type { ActivityEntry, ActivityFilter } from '@dorado/contracts'

export async function list(filter: ActivityFilter): Promise<ActivityEntry[]> {
  return await activity.list(filter)
}
