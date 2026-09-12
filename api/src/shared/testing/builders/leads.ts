import type { PoolClient } from 'pg'
import type { LeadPatch } from '@dorado/contracts'
import { aTag } from '#shared/testing/builders/ids.ts'
import * as leads from '#db/leads/repo.ts'

export async function aLead(c: PoolClient, options: Partial<LeadPatch> = {}) {
  const tag = aTag()
  return leads.create(
    {
      name: options.name ?? `Test Lead ${tag}`,
      phone: options.phone ?? '2145550100',
      email: options.email ?? `${tag}@dorado.test`,
      priority: options.priority ?? 'Medium',
      notes: options.notes ?? null,
      source: options.source ?? null,
      assigned_to_id: options.assigned_to_id ?? null,
    },
    c
  )
}
