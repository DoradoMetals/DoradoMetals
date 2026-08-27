// fulfillments.methods, and nothing else.
//
// THIS IS THE FIRST TABLE IN THE MIGRATION WITH NO exchange SIDE, and that is
// not an omission. exchange never recorded how an order was fulfilled beyond
// shipments.pickup_type, a text column holding two values. The eleven rows here
// come from 047_seed_reference_data.sql, which supplies what exchange never
// held - so there is no source to read from, nothing to mirror, and nothing to
// switch between. A *_SOURCE switch would have exactly one state.
//
// Three categories, and they are code rather than data. Each names which table
// carries the detail:
//
//   SHIPMENT  -> fulfillments.shipments  (a parcel, handled by features/shipping)
//   PICKUP    -> fulfillments.pickups    (we collect from the customer)
//   DIRECT    -> fulfillments.directs    (the customer comes to a location)
//
// label vs admin_label is a real distinction and both are kept: 'Pickup' means
// two different things to a customer depending on the category, and the admin
// side needs to tell 'Dorado Pickup' from 'Carrier Pickup'.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// created_by / updated_by / created_by_id / updated_by_id are not projected -
// who last edited a reference row is not part of the menu.
export type MethodRow = Pick<
  fulfillments.MethodsRow,
  | "id" | "type" | "label" | "admin_label" | "category" | "direction"
  | "enabled" | "hidden" | "is_default" | "created_at" | "updated_at"
>;

export async function getAvailable(
  direction: string, executor?: Executor
): Promise<MethodRow[]> {
  const { rows } = await query<MethodRow>(sql("get_available"), [direction], executor);
  return rows;
}

export async function getAll(executor?: Executor): Promise<MethodRow[]> {
  const { rows } = await query<MethodRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<MethodRow | undefined> {
  const { rows } = await query<MethodRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// By id, for composing a method into a fulfillment without a join per row.
// Eleven rows, so one read and a Map beats a join on every query.
export async function byId(executor?: Executor): Promise<Map<string, MethodRow>> {
  return new Map((await getAll(executor)).map((m) => [m.id, m]));
}

// The default for a direction and category, for the flows that do not ask.
export async function getDefault(
  { direction, category }: { direction: string; category: string },
  executor?: Executor
): Promise<MethodRow | undefined> {
  const { rows } = await query<MethodRow>(
    sql("get_default"), [direction, category], executor
  );
  return rows[0];
}

// EVERY FIELD IS OPTIONAL AND `undefined` MEANS "LEAVE IT". The statement
// COALESCEs each one, so a partial update - which is what every admin toggle
// sends - leaves the rest alone. `null` is therefore not usable as a value
// here, and no column this writes is nullable in a way that would want it.
export type MethodInput = {
  id: string;
  label?: string;
  admin_label?: string;
  enabled?: boolean;
  hidden?: boolean;
  updated_by_id?: string | null;
};

// No create and no remove - see the header of sql/update.sql.
export async function update(
  m: MethodInput, executor?: Executor
): Promise<MethodRow | undefined> {
  const { rows } = await query<MethodRow>(
    sql("update"),
    [m.id, m.label ?? null, m.admin_label ?? null,
     m.enabled ?? null, m.hidden ?? null, m.updated_by_id ?? null],
    executor
  );
  return rows[0];
}
