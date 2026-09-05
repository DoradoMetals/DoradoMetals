import withTransaction from "#shared/db/withTransaction.ts";
import * as products from "#db/products/repo.ts";
import * as rules from "#domain/products/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  BullionAdmin, BullionFilter, BullionGroup, BullionLiveness, BullionPatchColumns,
  BullionStorefront,
  QuoteItem,
} from "@dorado/contracts";

export async function listGroups(filter: BullionFilter): Promise<BullionGroup[]> {
  return rules.group(await products.listFor(filter));
}

export async function getGroupBySlug(slug: string): Promise<BullionGroup> {
  const groups = rules.group(await products.listFor({ slug, display: true }));
  rules.assertGroup(groups[0], slug);
  return groups[0];
}

export async function listAdminProducts(): Promise<BullionAdmin[]> {
  return await products.listAdmin();
}

export async function getAdminProduct(id: string, executor?: Executor): Promise<BullionAdmin> {
  const row = await products.getOne(id, executor);
  rules.assertProduct(row, id);
  return row;
}

export async function listTypes(): Promise<string[]> {
  return await products.listTypes();
}

export async function getLiveness(
  ids: string[], executor?: Executor
): Promise<BullionLiveness[]> {
  return await products.getLiveness(ids, executor);
}

export async function getByIds(
  ids: string[], executor?: Executor
): Promise<BullionStorefront[]> {
  return await products.listFor({ ids }, executor);
}

export async function getItemsFromServer(
  items: QuoteItem[]
): Promise<(BullionStorefront & { quantity: number })[]> {
  const wanted = new Map(items.map((i) => [i.id, i.quantity]));
  const rows = await products.listFor({ ids: [...wanted.keys()] });
  return rows.map((row) => ({ ...row, quantity: wanted.get(row.id) ?? 0 }));
}

export async function updateProduct(
  id: string, patch: BullionPatchColumns
): Promise<BullionAdmin> {
  const changed = await withTransaction(async (tx) => await products.update(id, patch, tx));
  rules.assertChanged(changed, id);
  return await getAdminProduct(id);
}

export async function createProduct(patch: BullionPatchColumns): Promise<BullionAdmin> {
  return await withTransaction(async (tx) => {
    const id = await products.create({ ...rules.NEW_PRODUCT_DEFAULTS, ...patch }, tx);
    return await getAdminProduct(id, tx);
  });
}
