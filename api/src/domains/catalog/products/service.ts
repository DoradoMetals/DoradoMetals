import withTransaction from '#shared/db/withTransaction.ts'
import * as products from '#db/products/repo.ts'
import * as rules from '#catalog/products/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  BullionAdmin,
  BullionCreate,
  BullionFilter,
  BullionGroup,
  BullionPatchColumns,
} from '@dorado/contracts'

export async function listGroups(filter: BullionFilter): Promise<BullionGroup[]> {
  return rules.group(await products.listFor(filter))
}

export async function getGroupBySlug(slug: string): Promise<BullionGroup> {
  const groups = rules.group(await products.listFor({ slug, display: true }))
  rules.assertGroup(groups[0], slug)
  return groups[0]
}

export async function listAdminProducts(): Promise<BullionAdmin[]> {
  return await products.listAdmin()
}

export async function getAdminProduct(id: string, executor?: Executor): Promise<BullionAdmin> {
  const row = await products.getOne(id, executor)
  rules.assertProduct(row, id)
  return row
}

export async function listTypes(): Promise<string[]> {
  return await products.listTypes()
}

export async function updateProduct(id: string, patch: BullionPatchColumns): Promise<BullionAdmin> {
  const changed = await withTransaction(async (tx) => await products.update(id, patch, tx))
  rules.assertChanged(changed, id)
  return await getAdminProduct(id)
}

export async function createProduct(patch: BullionCreate): Promise<BullionAdmin> {
  return await withTransaction(async (tx) => {
    const id = await products.create(patch, tx)
    return await getAdminProduct(id, tx)
  })
}
