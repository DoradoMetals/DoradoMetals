// exchange.products. THIS FILE IS SCHEDULED FOR DELETION.
//
// Takes the SAME values array as repo.ts, in the same order. Three columns are
// named differently here - product_name, product_description, product_type -
// and the statements differ only in that.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor, ProductValues } from "#features/products/repo.ts";

const sql = sqlFrom(import.meta.dirname);

// exchange defaults everything this does not name, which is the behaviour the
// create path has always relied on. products.bullion cannot, which is why
// repo.ts's create takes seven more values.
export async function create(
  id: string, name: string, created_by: string, executor?: Executor
): Promise<void> {
  await query(sql("create"), [id, created_by, name], executor);
}

export async function update(
  id: string, values: ProductValues, executor?: Executor
): Promise<void> {
  await query(sql("update"), [...values, id], executor);
}
