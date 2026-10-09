import type { PoolClient } from 'pg'
import type { EstimateItemPatch, LeadPatch } from '@dorado/contracts'
import { aTag } from '#shared/testing/builders/ids.ts'
import {
  estimateKindId,
  estimateUnitId,
  purityLabelId,
} from '#shared/testing/builders/reference.ts'
import * as leads from '#db/leads/repo.ts'
import * as estimateItems from '#db/leads/estimate-items/repo.ts'

export async function aLead(c: PoolClient, options: Partial<LeadPatch> = {}) {
  const tag = aTag()
  return leads.create(
    {
      name: options.name ?? `Test Lead ${tag}`,
      phone: options.phone ?? '2145550100',
      email: options.email ?? `${tag}@dorado.test`,
      priority: options.priority ?? 'Medium',
      source: options.source ?? null,
      source_id: options.source_id ?? null,
      contact_preference_id: options.contact_preference_id ?? null,
      assigned_to_id: options.assigned_to_id ?? null,
    },
    c
  )
}

export async function anEstimateItem(
  c: PoolClient,
  lead_id: string,
  options: Partial<EstimateItemPatch> = {}
) {
  const custom = options.custom_purity ?? null
  return estimateItems.create(
    lead_id,
    {
      kind_id: options.kind_id ?? (await estimateKindId(c, 'scrap')),
      metal_id: options.metal_id ?? 'Gold',
      weight: options.weight ?? 10,
      unit_id: options.unit_id ?? (await estimateUnitId(c, 'troy_oz')),
      purity_id:
        options.purity_id ?? (custom === null ? await purityLabelId(c, 'Gold', '14K') : null),
      custom_purity: custom,
    },
    c
  )
}
