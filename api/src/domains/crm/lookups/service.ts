import * as sources from '#db/leads/sources/repo.ts'
import * as estimateKinds from '#db/leads/estimate-kinds/repo.ts'
import * as contactPreferences from '#db/leads/contact-preferences/repo.ts'
import * as weightUnits from '#db/leads/weight-units/repo.ts'
import * as purityLabels from '#db/metals/purity-labels/repo.ts'
import * as leadDocuments from '#db/leads/documents/repo.ts'
import type {
  LeadDocumentKind,
  LeadLookup,
  PurityLookup,
  WeightUnitLookup,
} from '@dorado/contracts'

export async function leadSources(): Promise<LeadLookup[]> {
  return await sources.list()
}

export async function leadEstimateKinds(): Promise<LeadLookup[]> {
  return await estimateKinds.list()
}

export async function leadContactPreferences(): Promise<LeadLookup[]> {
  return await contactPreferences.list()
}

export async function leadWeightUnits(): Promise<WeightUnitLookup[]> {
  return await weightUnits.list()
}

export async function purities(): Promise<PurityLookup[]> {
  return await purityLabels.lookup()
}

export async function leadDocumentKinds(): Promise<LeadDocumentKind[]> {
  return await leadDocuments.namedKinds()
}
