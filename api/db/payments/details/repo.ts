import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PaymentDetailsView, PaymentDetailsSealed } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentDetailsPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(PaymentDetailsPatch.omit({ user_id: true }));

export async function getOne(id: string, executor?: Executor): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query<PaymentDetailsView>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<PaymentDetailsView[]> {
  const { rows } = await query<PaymentDetailsView>(sql("list_for_user"), [user_id], executor);
  return rows;
}

export async function findByProviderRef(
  provider: string | null, provider_ref: string, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query<PaymentDetailsView>(
    sql("find_by_provider_ref"), [provider, provider_ref], executor
  );
  return rows[0];
}

export async function getSealed(
  id: string, executor?: Executor
): Promise<PaymentDetailsSealed | undefined> {
  const { rows } = await query<PaymentDetailsSealed>(sql("get_sealed"), [id], executor);
  return rows[0];
}

export async function create(
  user_id: string, values: PaymentDetailsPatch, executor?: Executor
): Promise<PaymentDetailsView> {
  const { rows } = await query<PaymentDetailsView>(
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
  return rows[0];
}

const RETURNING = `id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at`;

export async function update(
  id: string, patch: PaymentDetailsPatch, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const built = buildUpdate({
    table: "payments.details", allowed: PATCHABLE, patch, where: { id },
    returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<PaymentDetailsView>(built.text, built.values, executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
