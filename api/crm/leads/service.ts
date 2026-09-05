import withTransaction from "#shared/db/withTransaction.ts";
import * as leads from "#db/leads/repo.ts";
import * as rules from "#crm/leads/rules.ts";
import type { Lead, LeadPatch } from "@dorado/contracts";

export async function getOne(id: string): Promise<Lead> {
  const row = await leads.getOne(id);
  rules.assertLead(row, id);
  return row;
}

export async function list(): Promise<Lead[]> {
  return await leads.list();
}

export async function create(lead: LeadPatch): Promise<Lead> {
  return withTransaction(async (client) => {
    return await leads.create(lead, client);
  });
}

export async function update(id: string, patch: LeadPatch): Promise<Lead> {
  return withTransaction(async (client) => {
    const row = await leads.update(id, patch, client);
    rules.assertLead(row, id);
    return row;
  });
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await leads.remove(id, client);
  });
}
