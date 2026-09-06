import withTransaction from '#shared/db/withTransaction.ts'
import * as carriers from '#db/shipping/carriers/repo.ts'
import * as organizations from '#db/organizations/repo.ts'
import type { ComposedCarrier } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import type { CarrierPatch } from '@dorado/contracts'

export async function getAllCarriers(): Promise<ComposedCarrier[]> {
  return await carriers.view(null)
}

export async function getCarrierById(
  id: string,
  executor?: Executor
): Promise<ComposedCarrier | null> {
  return (await carriers.view(id, executor))[0] ?? null
}

export async function getCarrierName(id: string, executor?: Executor): Promise<string> {
  return (await getCarrierById(id, executor))?.organization.name ?? ''
}

export async function createCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  return await withTransaction(async (tx) => {
    const organization = await organizations.create(carrier.organization, 'CARRIER', tx)
    const row = await carriers.create(
      { organization_id: organization.id, logo: carrier.logo ?? null },
      tx
    )
    return (await carriers.view(row.id, tx))[0] ?? null
  })
}

export async function updateCarrier(carrier: CarrierPatch): Promise<ComposedCarrier | null> {
  const id = carrier.id
  if (!id) return null

  return await withTransaction(async (tx) => {
    const current = await carriers.getOne(id, tx)
    if (!current) return null

    // `?? null` turned an omitted logo into an explicit clear, so any edit that
    // named only the organization deleted the logo (LD F18).
    const changed = await carriers.update(id, { logo: carrier.logo }, tx)
    if (!changed) return null

    if (current.organization_id) {
      await organizations.update(current.organization_id, carrier.organization, tx)
    }

    return (await carriers.view(id, tx))[0] ?? null
  })
}

export async function removeCarrier(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const row = await carriers.getOne(id, tx)
    await carriers.remove(id, tx)
    if (row?.organization_id) await organizations.remove(row.organization_id, tx)
    return true
  })
}
