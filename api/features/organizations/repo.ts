// organizations.organizations, and nothing else.
//
// THE ONLY SERVICE THAT WRITES THIS TABLE. Carriers create and update an
// organization as part of creating and updating a carrier, and refiners and
// mints compose one into their own shape. Every one of those used to reach into
// this table directly - the carrier update was a statement against
// organizations that had to know about shipping.carriers to find its row.
//
// One table, one writing service: carriers' service calls this one, inside its
// own transaction, rather than writing here itself.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { organizations } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type OrganizationRow = organizations.OrganizationsRow;
export type Executor = PoolClient | undefined;

export type OrganizationInput = {
  name?: string | null; email?: string | null;
  phone?: string | null; enabled?: boolean | null;
};

export async function create(
  id: string, type: string, o: OrganizationInput, executor?: Executor
): Promise<OrganizationRow> {
  const { rows } = await query<OrganizationRow>(
    sql("create"),
    [id, type, o.name ?? null, o.email ?? null, o.phone ?? null, o.enabled ?? null],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, o: OrganizationInput, executor?: Executor
): Promise<OrganizationRow | undefined> {
  const { rows } = await query<OrganizationRow>(
    sql("update"),
    [o.name ?? null, o.email ?? null, o.phone ?? null, o.enabled ?? null, id],
    executor
  );
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}

export async function getAll(executor?: Executor): Promise<OrganizationRow[]> {
  const { rows } = await query<OrganizationRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<OrganizationRow | undefined> {
  const { rows } = await query<OrganizationRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// By id, for the features that compose an organization into their own shape
// rather than joining to get it. A handful of rows, so one read and a Map beats
// a join on every query - and it keeps the join out of the repos that need it.
export async function byId(executor?: Executor): Promise<Map<string, OrganizationRow>> {
  const rows = await getAll(executor);
  return new Map(rows.map((o) => [o.id, o]));
}
