// shipping.services, and nothing else.
//
// Three columns are aliased back to the names exchange uses - see the header of
// sql/get_all.sql. The type says so too rather than describing the table: it is
// the wire shape that must not change, not the schema.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// created_by_id and updated_by_id are dropped because no statement projects
// them; the three renamed columns are dropped and re-added under exchange's
// names, because that is what comes back.
export type ServiceRow = Omit<
  shipping.ServicesRow,
  | "supports_pickups"
  | "supports_dropoffs"
  | "max_weight_lb"
  | "created_by_id"
  | "updated_by_id"
  // max_insured_value is 097's, and it is NOT on this wire. See
  // sql/get_insurance_ceilings.sql for why: this shape is validated against
  // exchange.carrier_services, which has no such column. getInsuranceCeilings
  // reads it instead.
  | "max_insured_value"
> & {
  supports_pickup: shipping.ServicesRow["supports_pickups"];
  supports_dropoff: shipping.ServicesRow["supports_dropoffs"];
  max_weight_lbs: shipping.ServicesRow["max_weight_lb"];
};

// The values every write supplies, in the order both sql/create.sql and
// sql/legacy/create.sql take them. ONE array feeds both statements, which is
// the whole reason the two column lists are kept in the same order despite
// three of the names differing.
export type ServiceValues = [
  string | null, string | null, string | null, string | null, string | null,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  number | null, number | null, number | null, number | null, number | null,
  number | null, number | null, number | null,
  string, string,
];

export async function getAll(executor?: Executor): Promise<ServiceRow[]> {
  const { rows } = await query<ServiceRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<ServiceRow | undefined> {
  const { rows } = await query<ServiceRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// THE INSURANCE CEILING, per service, for one carrier. Read on its own rather
// than folded into the row reads - see sql/get_insurance_ceilings.sql.
type InsuranceCeiling = { name: string; max_insured_value: number };

export async function getInsuranceCeilings(
  carrier_id: string, executor?: Executor
): Promise<InsuranceCeiling[]> {
  const { rows } = await query<InsuranceCeiling>(
    sql("get_insurance_ceilings"), [carrier_id], executor
  );
  return rows;
}

export async function getByCarrier(
  carrier_id: string, executor?: Executor
): Promise<ServiceRow[]> {
  const { rows } = await query<ServiceRow>(sql("get_by_carrier"), [carrier_id], executor);
  return rows;
}

export async function create(
  id: string, values: ServiceValues, executor?: Executor
): Promise<ServiceRow> {
  const { rows } = await query<ServiceRow>(sql("create"), [id, ...values], executor);
  return rows[0];
}

// The update takes the same values in the same order with TWO differences:
// created_by is not reassigned (an edit does not change who created the row),
// and the id moves to the end. Spelled out rather than sliced, because a
// silently misaligned parameter array is the one error the generator cannot
// catch and tests/unit.test.ts asserts this ordering against the SQL.
export function updateParams(id: string, values: ServiceValues): unknown[] {
  const [, ...rest] = [...values].reverse();      // drop updated_by
  const withoutBoth = rest.slice(1).reverse();    // and created_by
  return [...withoutBoth, values[values.length - 1], id];
}

export async function update(
  id: string, values: ServiceValues, executor?: Executor
): Promise<ServiceRow | undefined> {
  const { rows } = await query<ServiceRow>(sql("update"), updateParams(id, values), executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}
