// Dual-write phase of the leads schema migration.
//
// Every write is applied to exchange.leads and then mirrored verbatim into
// leads.leads, both inside one transaction. Reads come from the new schema, so the new
// schema is exercised by real traffic while exchange stays a complete, current
// replica.
//
// That is what makes the switch reversible. Reading from the new schema alone is a
// one-way door: exchange stops receiving writes the moment it is flipped, and
// flipping back silently drops everything written in between. Under dual, both
// tables hold the same rows, so falling back to exchange loses nothing.
//
// The mirror deliberately does not insert into both schemas independently.
// Exchange performs the write and the row it returns is copied across, so the
// generated id and every column default are identical by construction rather
// than by hope.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/leads/repo.exchange.js";
import * as next from "#features/leads/repo.next.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// Reads come from the new schema: the point of this phase is to exercise it.
export const getLead = next.getLead;
export const getAllLeads = next.getAllLeads;

// If the caller already has a transaction, join it rather than opening another,
// so the two writes stay atomic with whatever else the caller is doing.
const both = async <T>(executor: Executor, fn: (c: PoolClient) => Promise<T>) =>
  executor ? fn(executor) : withTransaction(fn);

export async function createLead(lead: next.NewLead, executor?: Executor) {
  return both(executor, async (c) => {
    const written = await exchange.createLead(lead, c);
    await next.mirrorLead(written.id, c);
    return written;
  });
}

export async function updateLead(
  lead: next.LeadRow,
  user_name: string,
  executor?: Executor
) {
  return both(executor, async (c) => {
    const written = await exchange.updateLead(lead, user_name, c);
    await next.mirrorLead(written.id, c);
    return written;
  });
}

export async function deleteLead(id: string, executor?: Executor) {
  return both(executor, async (c) => {
    const result = await exchange.deleteLead(id, c);
    await next.deleteLead(id, c);
    return result;
  });
}
