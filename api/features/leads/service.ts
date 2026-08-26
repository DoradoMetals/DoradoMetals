// Leads, straight through to the switch.
import * as leadsRepo from "#features/leads/repo.js";
import type { LeadRow, NewLead } from "#features/leads/repo.next.ts";
import type { QueryResult } from "pg";

export async function getLead(id: string): Promise<LeadRow | undefined> {
  return await leadsRepo.getLead(id);
}

export async function getAllLeads(): Promise<LeadRow[]> {
  return await leadsRepo.getAllLeads();
}

export async function createLead(lead: NewLead): Promise<LeadRow> {
  return await leadsRepo.createLead(lead);
}

export async function updateLead(lead: LeadRow, user_name: string): Promise<LeadRow> {
  return await leadsRepo.updateLead(lead, user_name);
}

export async function deleteLead(id: string): Promise<QueryResult> {
  return leadsRepo.deleteLead(id);
}
