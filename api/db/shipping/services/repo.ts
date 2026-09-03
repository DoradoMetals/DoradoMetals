// shipping.services. Three columns alias back to exchange's names (see sql/get_all.sql) - the wire shape must not change.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ServiceRow = Omit<
  shipping.ServicesRow,
  | "supports_pickups"
  | "supports_dropoffs"
  | "max_weight_lb"
  | "created_by_id"
  | "updated_by_id"
  // max_insured_value is not on this wire - getInsuranceCeilings reads it instead.
  | "max_insured_value"
> & {
  supports_pickup: shipping.ServicesRow["supports_pickups"];
  supports_dropoff: shipping.ServicesRow["supports_dropoffs"];
  max_weight_lbs: shipping.ServicesRow["max_weight_lb"];
};

// Every column a create or update supplies, by name - spelled onto each statement's parameter list in one place, not a shared positional array.
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

// The insurance ceiling per service, for one carrier - read on its own, not folded into the row reads.
export type InsuranceCeiling = { id: string; name: string; max_insured_value: number };

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

// created_by/updated_by are NOT fields here - public.audit_stamp writes both from the connection's actor.
export type ServiceNew = ServiceWrite & Pick<shipping.ServicesRow, "id">;

export async function create(row: ServiceNew, executor?: Executor): Promise<ServiceRow> {
  const { rows } = await query<ServiceRow>(
    sql("create"),
    [
      row.id, row.carrier_id, row.name, row.description, row.code, row.provider_code,
      row.supports_pickups, row.supports_dropoffs, row.supports_returns, row.supports_insurance,
      row.is_international, row.is_residential, row.is_active,
      row.max_weight_lb, row.max_length_in, row.max_width_in, row.max_height_in,
      row.max_declared_value, row.min_transit_days, row.max_transit_days, row.display_order,
    ],
    executor
  );
  return rows[0];
}

// created_by/updated_by are NOT part of the patch - audit_stamp writes both from the connection's actor.
// A key PRESENT is written, a key ABSENT is left alone - the same contract every other update() in this codebase keeps.
export type ServicePatch = Partial<ServiceWrite>;

// The columns a create or edit supplies; RETURNING below preserves the wire's aliased names.
export const PATCHABLE = [
  "carrier_id", "name", "description", "code", "provider_code",
  "supports_pickups", "supports_dropoffs", "supports_returns", "supports_insurance",
  "is_international", "is_residential", "is_active",
  "max_weight_lb", "max_length_in", "max_width_in", "max_height_in",
  "max_declared_value", "min_transit_days", "max_transit_days", "display_order",
] as const;

export const RETURNING = `id, carrier_id, name, description, code, provider_code,
          supports_pickups  AS supports_pickup,
          supports_dropoffs AS supports_dropoff,
          supports_returns, supports_insurance,
          is_international, is_residential, is_active,
          max_weight_lb     AS max_weight_lbs,
          max_length_in, max_width_in, max_height_in, max_declared_value,
          min_transit_days, max_transit_days, display_order,
          created_by, updated_by, created_at, updated_at`;

export async function update(
  id: string, patch: ServicePatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "shipping.services", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}

// The sale delivery options: the business's carrier-agnostic priced rows - a projection, not ServiceRow, with no carrier flags or legacy aliases.
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
