// Dual-write phase of the leads schema migration.
//
// Every write is applied to exchange.leads and then mirrored verbatim into
// core.leads, both inside one transaction. Reads come from core, so the new
// schema is exercised by real traffic while exchange stays a complete, current
// replica.
//
// That is what makes the switch reversible. Reading from core alone is a
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
import * as core from "#features/leads/repo.core.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// Reads come from core: the point of this phase is to exercise it.
export const getLead = core.getLead;
export const getAllLeads = core.getAllLeads;

// If the caller already has a transaction, join it rather than opening another,
// so the two writes stay atomic with whatever else the caller is doing.
const both = async <T>(executor: Executor, fn: (c: PoolClient) => Promise<T>) =>
  executor ? fn(executor) : withTransaction(fn);

export async function createLead(lead: core.NewLead, executor?: Executor) {
  return both(executor, async (c) => {
    const written = await exchange.createLead(lead, c);
    await core.mirrorLead(written, c);
    return written;
  });
}

export async function updateLead(
  lead: core.LeadRow,
  user_name: string,
  executor?: Executor
) {
  return both(executor, async (c) => {
    const written = await exchange.updateLead(lead, user_name, c);
    await core.mirrorLead(written, c);
    return written;
  });
}

export async function deleteLead(id: string, executor?: Executor) {
  return both(executor, async (c) => {
    const result = await exchange.deleteLead(id, c);
    await core.deleteLead(id, c);
    return result;
  });
}
