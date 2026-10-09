import * as metals from '#db/metals/repo.ts'
import * as purityLabels from '#db/metals/purity-labels/repo.ts'
import type { Metal, PurityLabel } from '@dorado/contracts'

export async function listMetals(): Promise<Metal[]> {
  return await metals.list()
}

export async function listPurityLabels(): Promise<PurityLabel[]> {
  return await purityLabels.list()
}
