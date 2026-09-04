// The bullion catalogue: what is for sale, what may be sold back, and what one
// product page shows.
//
// LOAD -> ASSERT -> WRITE. Refusals are rules.ts's (ruling 65); the composition
// that used to attach metal/mint/supplier names is gone - db/products' two
// statements join them.
import withTransaction from "#shared/db/withTransaction.ts";
import * as products from "#db/products/repo.ts";
import * as rules from "#domain/products/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  BullionAdmin, BullionFilter, BullionGroup, BullionLiveness, BullionPatch, BullionPatchColumns,
  BullionStorefront,
} from "@dorado/contracts";

// ------------------------------------------------------------------- reads

// THE STOREFRONT, GROUPED. A caller asks with filters and gets families, not
// rows: the browser used to group by `variant_group`, pick a headline variant
// and re-sort the siblings on four different screens.
export async function listGroups(filter: BullionFilter): Promise<BullionGroup[]> {
  return rules.group(await products.listFor(filter));
}

// ONE PRODUCT PAGE. A slug names a FAMILY - gold-american-eagle is four rows
// by variant_label - so this is one group, not one row, and there is
// deliberately no unique index on slug.
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

// Whether an id may be BOUGHT. Its own read rather than a column on the
// catalogue projection: `display` is an admin fact and must not reach the
// public wire.
export async function getLiveness(
  ids: string[], executor?: Executor
): Promise<BullionLiveness[]> {
  return await products.getLiveness(ids, executor);
}

// The catalogue rows behind a set of ids. Checkout reads a product's metal and
// its bid premium through here rather than joining products.bullion into its
// own write - the feature that owns the table answers for it.
export async function getByIds(
  ids: string[], executor?: Executor
): Promise<BullionStorefront[]> {
  return await products.listFor({ ids }, executor);
}

// The price of a product comes from the server, not the cart: the client sends
// ids and quantities, everything else (premium, content, purity) is read back.
// Only `quantity` survives from the request.
export async function getItemsFromServer(
  items: { id: string; quantity: number }[]
): Promise<(BullionStorefront & { quantity: number })[]> {
  const wanted = new Map(items.map((i) => [i.id, i.quantity]));
  const rows = await products.listFor({ ids: [...wanted.keys()] });
  return rows.map((row) => ({ ...row, quantity: wanted.get(row.id) ?? 0 }));
}

// ------------------------------------------------------------------ writes

// The patch IS the input (ruling 46, and the CRUD pass-through rule): this
// used to re-spell twenty-five columns on the way to a repo that spelled them
// again. metal_id/supplier_id/mint_id travel as IDS (ruling 43) - a caller
// naming one the database does not have gets the database's own foreign-key
// refusal.
export async function updateProduct(
  id: string, patch: BullionPatchColumns
): Promise<BullionAdmin> {
  const changed = await withTransaction(async (tx) => await products.update(id, patch, tx));
  rules.assertChanged(changed, id);
  return await getAdminProduct(id);
}

// Insert and read the composed admin row back in one transaction - a failure
// on the read cannot leave a half-created product behind.
// created_by is not an input: the trigger writes the author from the session
// (migration 116), so a caller cannot claim to be somebody else.
export async function createProduct(patch: BullionPatch): Promise<BullionAdmin> {
  return await withTransaction(async (tx) => {
    const id = await products.create({ ...rules.NEW_PRODUCT_DEFAULTS, ...patch }, tx);
    return await getAdminProduct(id, tx);
  });
}
