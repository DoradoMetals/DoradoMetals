// Leads: orchestration and the wire shape.
//
// update takes an id and a patch, never a round-tripped row; it refetches after so the response still carries fresh state.
import withTransaction from "#shared/db/withTransaction.ts";
import * as leads from "#db/leads/repo.ts";
import type { LeadRow, NewLead, LeadPatch } from "#db/leads/repo.ts";

// The wire IS the row - no identity adapter.
export type LeadWire = LeadRow;

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
  // A missing lead is a 404, not a 200 carrying undefined - the latter reaches the client as an empty body, indistinguishable from a lead with no fields.
  if (!row) throw notFound(id);
  return row;
}

export async function list(): Promise<LeadWire[]> {
  return await leads.list();
}

export async function create(lead: NewLead): Promise<LeadWire> {
  return withTransaction(async (client) => {
    return await leads.create(lead, client);
  });
}

export async function update(id: string, patch: LeadPatch): Promise<LeadWire> {
  return withTransaction(async (client) => {
    const changed = await leads.update(id, patch, client);
    if (!changed) throw notFound(id);
    const row = await leads.getOne(id, client);
    if (!row) throw notFound(id);
    return row;
  });
}

// Answers whether a row went, so the controller can 404 rather than report success for an id that was never there.
export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await leads.remove(id, client);
  });
}
