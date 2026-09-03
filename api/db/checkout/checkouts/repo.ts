// checkout.checkouts, and nothing else.
//
// ONE TABLE FOR BOTH DIRECTIONS. exchange had carts and sell_carts, each UNIQUE
// (user_id); here there is one row per (user_id, direction), taking the same
// values orders.orders uses - 'sale' for buying from us, 'purchase' for selling
// to us - so a checkout and the order it becomes agree.
//
// DEVICE-SYNC, NOT A LEDGER (CLAUDE.md). A session exists so a customer sees
// the same basket on their phone as on their laptop. Empty is fine; losing one
// is fine. What matters is that it works.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { checkout } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type CheckoutRow = checkout.checkouts.Row;

export type NewCheckout = { user_id: string; direction: string };

// EVERY COLUMN A SESSION CARRIES except its own key and its owner. Which of
// these a REQUEST may name is a narrower question, and it is answered at the
// transport boundary by the body schema - not here, because the service also
// writes fulfillment_id and the payout pointers, which no request may send.
export const PATCHABLE = [
  "payment_method_id", "payment_details_id", "fulfillment_id",
  "fulfillment_method_id", "appointment_location_id", "pickup_address_id",
  "shipper_address_id", "recipient_address_id", "carrier_service_id",
  "package_id", "appointment_time", "package_weight", "declared_value",
  "pickup_date", "pickup_time",
] as const;

export type CheckoutPatch = Partial<Pick<CheckoutRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<CheckoutRow | undefined> {
  const { rows } = await query<CheckoutRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// The natural key: one session per customer per direction.
export async function findFor(
  user_id: string, direction: string, executor?: Executor
): Promise<CheckoutRow | undefined> {
  const { rows } = await query<CheckoutRow>(sql("find_for"), [user_id, direction], executor);
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<CheckoutRow[]> {
  const { rows } = await query<CheckoutRow>(sql("list_for_user"), [user_id], executor);
  return rows;
}

// Answers undefined when a concurrent request won the race - see sql/create.sql.
export async function create(
  row: NewCheckout, executor?: Executor
): Promise<CheckoutRow | undefined> {
  const { rows } = await query<CheckoutRow>(
    sql("create"), [row.user_id, row.direction], executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: CheckoutPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "checkout.checkouts", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
