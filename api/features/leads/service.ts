// Leads: orchestration, transactions, and the dual write.
//
// A service may call any repo; a repo may touch only its own table. This is
// where a write that spans tables becomes atomic, and where the decision to
// keep writing exchange lives - so that removing exchange later is a change to
// this file rather than to every repo under it.
//
// WHY WRITES GO TO BOTH AND READS COME FROM ONE. Reads come from leads.leads,
// so the new schema is exercised by real traffic. Writes also go to
// exchange.leads, so exchange stays a complete, current replica and falling
// back to it loses nothing. Reading from the new schema alone would be
// reversible; writing to it alone would not.
//
// THE ID IS GENERATED HERE, not by either database. Both rows must carry the
// same primary key, and the only way to guarantee that is for one side to
// choose it and both to use it. The previous implementation let exchange
// generate it and then copied the row across server-side, which also worked -
// but it made exchange the source of the id, which is the dependency this
// restructure is removing.
//
// NOTHING IRREVERSIBLE INSIDE THE TRANSACTION. A transaction can be rolled
// back; an email cannot. shared/db/transaction-side-effects.test.js fails the
// build if one appears here.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as leads from "#features/leads/repo.ts";
import * as legacy from "#legacy/leads/repo.ts";
import { toWire, listToWire, type LeadWire } from "#features/leads/wire.ts";
import type { LeadRow, NewLead } from "#features/leads/repo.ts";

interface HttpError extends Error {
  statusCode?: number;
}

const notFound = (id: string): HttpError => {
  const err: HttpError = new Error(`no lead ${id}`);
  err.statusCode = 404;
  return err;
};

export async function getOne(id: string): Promise<LeadWire> {
  const row = await leads.getOne(id);
  // A missing lead is a 404, not a 200 carrying undefined. The old
  // implementation answered `200 undefined`, which reaches the client as an
  // empty body and is indistinguishable from a lead with no fields.
  if (!row) throw notFound(id);
  return toWire(row);
}

export async function getAll(): Promise<LeadWire[]> {
  return listToWire(await leads.getAll());
}

export async function create(lead: NewLead): Promise<LeadWire> {
  const id = randomUUID();
  return withTransaction(async (client) => {
    await legacy.create(id, lead, client);
    const row = await leads.create(id, lead, client);
    return toWire(row);
  });
}

export async function update(lead: LeadRow, user_name: string): Promise<LeadWire> {
  return withTransaction(async (client) => {
    await legacy.update(lead, user_name, client);
    const row = await leads.update(lead, user_name, client);
    if (!row) throw notFound(lead.id);
    return toWire(row);
  });
}

// Answers how many rows went, so the controller can 404 rather than report
// success for an id that was never there.
export async function remove(id: string): Promise<number> {
  return withTransaction(async (client) => {
    await legacy.remove(id, client);
    return await leads.remove(id, client);
  });
}
