// organizations.organizations, and nothing else.
//
// READ ONLY. An organization is created by seed (047) or by a migration; no
// route writes one. It exists as a feature because three other features -
// refiners, carriers and mints - compose an organization's name and contact
// details into their own shape, and each of them used to do it with a JOIN.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { organizations } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type OrganizationRow = organizations.OrganizationsRow;
export type Executor = PoolClient | undefined;

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
