// shipping.services, and nothing else.
//
// Three columns are aliased back to the names exchange uses - see the header of
// sql/get_all.sql. The type says so too rather than describing the table: it is
// the wire shape that must not change, not the schema.
import query from "#shared/db/query.ts";
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

// Every column a create or an update supplies, BY NAME (CRUD-batch-3): the
// service builds this object once and repo.ts spells its fields onto each
// statement's parameter list in exactly one place - no more one hand-built
// positional array feeding both statements by shared accident of column order.
export type ServiceWrite = Pick<
  shipping.ServicesRow,
  | "carrier_id" | "name" | "description" | "code" | "provider_code"
  | "supports_pickups" | "supports_dropoffs" | "supports_returns" | "supports_insurance"
  | "is_international" | "is_residential" | "is_active"
  | "max_weight_lb" | "max_length_in" | "max_width_in" | "max_height_in"
  | "max_declared_value" | "min_transit_days" | "max_transit_days" | "display_order"
>;

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

export type ServiceNew = ServiceWrite & Pick<shipping.ServicesRow, "id" | "created_by" | "updated_by">;

export async function create(row: ServiceNew, executor?: Executor): Promise<ServiceRow> {
  const { rows } = await query<ServiceRow>(
    sql("create"),
    [
      row.id, row.carrier_id, row.name, row.description, row.code, row.provider_code,
      row.supports_pickups, row.supports_dropoffs, row.supports_returns, row.supports_insurance,
      row.is_international, row.is_residential, row.is_active,
      row.max_weight_lb, row.max_length_in, row.max_width_in, row.max_height_in,
      row.max_declared_value, row.min_transit_days, row.max_transit_days, row.display_order,
      row.created_by, row.updated_by,
    ],
    executor
  );
  return rows[0];
}

// created_by is NOT part of the patch - an edit does not change who created
// the row, which is why the UPDATE statement never assigns it.
export type ServicePatch = ServiceWrite & Pick<shipping.ServicesRow, "updated_by">;

export async function update(
  id: string, patch: ServicePatch, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [
      patch.carrier_id, patch.name, patch.description, patch.code, patch.provider_code,
      patch.supports_pickups, patch.supports_dropoffs, patch.supports_returns, patch.supports_insurance,
      patch.is_international, patch.is_residential, patch.is_active,
      patch.max_weight_lb, patch.max_length_in, patch.max_width_in, patch.max_height_in,
      patch.max_declared_value, patch.min_transit_days, patch.max_transit_days, patch.display_order,
      patch.updated_by, id,
    ],
    executor
  );
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}

// THE SALE DELIVERY OPTIONS (D208): the business's carrier-agnostic priced
// rows. A projection, not ServiceRow - the customer-facing read carries no
// carrier capability flags and no legacy aliases.
export type SaleServiceOption = {
  id: string;
  name: string;
  code: string;
  price: number;
  display: boolean;
  is_active: boolean;
  min_transit_days: number | null;
  max_transit_days: number | null;
};

export async function getSaleOptions(executor?: Executor): Promise<SaleServiceOption[]> {
  const { rows } = await query<SaleServiceOption>(sql("get_sale_options"), [], executor);
  return rows;
}
