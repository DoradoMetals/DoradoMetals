import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf } from "#shared/db/columns.ts";
import { Checkout, CheckoutViewFacts, CheckoutWrite, type Direction } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(CheckoutWrite);
const RETURNING = returningOf(Checkout);

export type { CheckoutWrite } from "@dorado/contracts";

export async function view(
  id: string, executor?: Executor
): Promise<CheckoutViewFacts | undefined> {
  const { rows } = await query(sql("view"), [id], executor);
  return rows[0] === undefined ? undefined : CheckoutViewFacts.parse(rows[0]);
}

export async function getOne(id: string, executor?: Executor): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function findFor(
  user_id: string, direction: Direction, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(sql("find_for"), [user_id, direction], executor);
  return rows[0];
}

export async function findByFulfillment(
  fulfillment_id: string, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(
    sql("find_by_fulfillment"), [fulfillment_id], executor
  );
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<Checkout[]> {
  const { rows } = await query<Checkout>(sql("list_for_user"), [user_id], executor);
  return rows;
}

export async function create(
  row: Pick<Checkout, "user_id" | "direction">, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(
    sql("create"), [row.user_id, row.direction], executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: CheckoutWrite, executor?: Executor
): Promise<Checkout | undefined> {
  const built = buildUpdate({
    table: "checkout.checkouts", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<Checkout>(built.text, built.values, executor);
  return rows[0];
}

export async function reassign(
  id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("reassign"), [id, user_id], executor);
  return rowCount === 1;
}

export async function deferAddressOwnership(executor?: Executor): Promise<void> {
  await query(
    `SET CONSTRAINTS checkout.checkouts_recipient_address_theirs_fk DEFERRED`,
    [],
    executor
  );
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
