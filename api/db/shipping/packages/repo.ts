// shipping.packages: reference data, read-only - no create/update/remove. `find` resolves a carrier+label pair to its row.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PackageRow = Pick<
  shipping.packages.Row,
  | "id" | "carrier_id" | "label" | "length" | "width" | "height"
  | "is_carrier_packaging" | "image_id" | "created_at" | "updated_at"
>;

export async function getAll(executor?: Executor): Promise<PackageRow[]> {
  const { rows } = await query<PackageRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<PackageRow | undefined> {
  const { rows } = await query<PackageRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// The pair is the identity: two carriers may both offer a "Small Box".
export async function find(
  carrier_id: string, label: string, executor?: Executor
): Promise<PackageRow | undefined> {
  const { rows } = await query<PackageRow>(sql("find"), [carrier_id, label], executor);
  return rows[0];
}

// By id, for composing a package's label into a shipment rather than joining
// for it. Eleven rows, so one read and a Map beats a join on every query.
export async function labelsById(executor?: Executor): Promise<Map<string, string>> {
  return new Map((await getAll(executor)).map((p) => [p.id, p.label]));
}

// The checkout's box menu; see sql/get_offered.sql for which rows.
export type OfferedPackage = {
  id: string;
  label: string;
  length: number | null;
  width: number | null;
  height: number | null;
  is_carrier_packaging: boolean;
  min_weight_lb: number | null;
};

export async function getOffered(executor?: Executor): Promise<OfferedPackage[]> {
  const { rows } = await query<OfferedPackage>(sql("get_offered"), [], executor);
  return rows;
}
