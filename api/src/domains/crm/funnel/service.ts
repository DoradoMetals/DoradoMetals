import * as funnel from '#db/leads/funnel/repo.ts'
import type { LeadAssignee, LeadFunnel, LeadSummary, LeadSummaryWindow } from '@dorado/contracts'

export async function get(): Promise<LeadFunnel> {
  return await funnel.get()
}

export async function summary(window: LeadSummaryWindow): Promise<LeadSummary> {
  return await funnel.summary(window)
}

export async function assignees(): Promise<LeadAssignee[]> {
  return await funnel.assignees()
}
