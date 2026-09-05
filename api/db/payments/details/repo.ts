import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PaymentDetailsView, PaymentDetailsSealed, PaymentDetailsWrite } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentDetailsView as View, PaymentDetailsWrite as Write } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(Write.omit({ user_id: true }));

export async function getOne(id: string, executor?: Executor): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query(sql("get_one"), [id], executor);
  return rows[0] === undefined ? undefined : View.parse(rows[0]);
}

export async function getMany(order_ids: string[], executor?: Executor): Promise<PaymentDetailsView[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query(sql("get_many"), [order_ids], executor);
  return rows.map((row) => View.parse(row));
}

export async function listFor(user_id: string, executor?: Executor): Promise<PaymentDetailsView[]> {
  const { rows } = await query(sql("list_for_user"), [user_id], executor);
  return rows.map((row) => View.parse(row));
}

export async function findByProviderRef(
  provider: string | null, provider_ref: string, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query(sql("find_by_provider_ref"), [provider, provider_ref], executor);
  return rows[0] === undefined ? undefined : View.parse(rows[0]);
}

export async function getSealed(
  id: string, executor?: Executor
): Promise<PaymentDetailsSealed | undefined> {
  const { rows } = await query<PaymentDetailsSealed>(sql("get_sealed"), [id], executor);
  return rows[0];
}

export async function create(
  user_id: string, values: PaymentDetailsWrite, executor?: Executor
): Promise<PaymentDetailsView> {
  const { rows } = await query(
    sql("create"),
    [
      user_id, values.method_id ?? null, values.account_holder ?? null,
      values.bank_name ?? null, values.account_type ?? null,
      values.last_four ?? null, values.routing_last_four ?? null,
      values.email_to ?? null, values.routing_number_encrypted ?? null,
      values.account_number_encrypted ?? null, values.encryption_key_id ?? null,
      values.card_brand ?? null, values.provider ?? null,
      values.provider_ref ?? null,
    ],
    executor
  );
  return View.parse(rows[0]);
}

const RETURNING = `id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`;

export async function update(
  id: string, patch: PaymentDetailsWrite, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const built = buildUpdate({
    table: "payments.details", allowed: PATCHABLE, patch, where: { id },
    returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query(built.text, built.values, executor);
  return rows[0] === undefined ? undefined : View.parse(rows[0]);
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
