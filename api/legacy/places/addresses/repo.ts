// exchange.addresses. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange holds the postal address, its owner, that person's label for it and
// one is_default all on one row, so every function here takes both halves.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { AddressValues, Executor } from "#features/places/addresses/repo.ts";

const sql = sqlFrom(import.meta.dirname);

// is_valid TRUE and is_residential FALSE are literals here too - see repo.ts.
export async function create(
  id: string, user_id: string, values: AddressValues,
  label: string | null, isDefault: boolean, executor?: Executor
): Promise<void> {
  const [line_1, line_2, city, state, country, zip, country_code, phone_number] = values;
  await query(
    sql("create"),
    [id, user_id, line_1, line_2, city, state, country, zip, label,
     isDefault, phone_number, true, country_code, false],
    executor
  );
}

// Returns whether it matched, because this statement is still scoped by
// user_id: an address that is not the caller's updates nothing, and the service
// needs to know that rather than reporting success.
export async function update(
  id: string, user_id: string, values: AddressValues,
  label: string | null, isDefault: boolean, executor?: Executor
): Promise<boolean> {
  const [line_1, line_2, city, state, country, zip, country_code, phone_number] = values;
  const r = await query(
    sql("update"),
    [id, user_id, line_1, line_2, city, state, country, zip, label,
     isDefault, phone_number, country_code, false],
    executor
  );
  return (r.rowCount ?? 0) > 0;
}

export async function updateValidation(
  id: string, is_valid: boolean, is_residential: boolean, executor?: Executor
): Promise<void> {
  await query(sql("update_validation"), [is_valid, is_residential, id], executor);
}

export async function setDefault(
  user_id: string, address_id: string, executor?: Executor
): Promise<void> {
  await query(sql("set_default"), [user_id, address_id], executor);
}

export async function remove(
  id: string, user_id: string, executor?: Executor
): Promise<void> {
  await query(sql("delete"), [id, user_id], executor);
}
