// organizations.organizations, and nothing else.
//
// One table, one writing service: carriers' service calls this one, inside its own transaction, rather than writing here itself. Refiners and mints only compose an organization into their own shape.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Organization } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type OrganizationRow = Organization;

// id and type are supplied separately, not part of this Pick: id is caller-generated, type (CARRIER/REFINER/the business) is a fact this table does not decide.
export type OrganizationPatch = Pick<OrganizationRow, "name" | "email" | "phone" | "enabled">;

export const PATCHABLE = ["name", "email", "phone", "enabled"] as const;

// update() names all four fields explicitly rather than spreading, so an absent field is sent as null and clears the column - a full-row replace, not a partial patch (the frontend always sends the whole carrier back).
// updated_at is not set here: public.audit_stamp writes it.
export async function create(
  row: Partial<OrganizationPatch> | undefined, id: string, type: string, executor?: Executor
): Promise<OrganizationRow> {
  const { rows } = await query<OrganizationRow>(
    sql("create"),
    [id, type, row?.name, row?.email, row?.phone, row?.enabled],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, row: Partial<OrganizationPatch> | undefined, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "organizations.organizations",
    allowed: PATCHABLE,
    patch: {
      name: row?.name ?? null, email: row?.email ?? null,
      phone: row?.phone ?? null, enabled: row?.enabled ?? null,
    },
    where: { id },
  });
  // Four literal keys, so the builder can never answer null here - the check is for the type, not a case that happens.
  if (!built) return false;
  const r = await query(built.text, built.values, executor);
  return r.rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount === 1;
}

export async function list(executor?: Executor): Promise<OrganizationRow[]> {
  const { rows } = await query<OrganizationRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<OrganizationRow | undefined> {
  const { rows } = await query<OrganizationRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// By id, for callers that compose an organization into their own shape rather than joining. A handful of rows, so one read and a Map beats a join on every query.
export async function byId(executor?: Executor): Promise<Map<string, OrganizationRow>> {
  const rows = await list(executor);
  return new Map(rows.map((o) => [o.id, o]));
}
