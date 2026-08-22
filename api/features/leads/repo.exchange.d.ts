import type { PoolClient, QueryResult } from "pg";
import type { LeadRow, NewLead } from "./repo.core.ts";

/**
 * Types the JavaScript exchange repo so TypeScript callers - the dual-write
 * phase in particular - get a real row type without the file having to be
 * converted. It returns the same shape as the core repo by construction: the
 * two tables have identical columns after migrations 002 and 004.
 */
export function getLead(id: string, executor?: PoolClient): Promise<LeadRow | undefined>;
export function getAllLeads(executor?: PoolClient): Promise<LeadRow[]>;
export function createLead(lead: NewLead, executor?: PoolClient): Promise<LeadRow>;
export function updateLead(lead: LeadRow, user_name: string, executor?: PoolClient): Promise<LeadRow>;
export function deleteLead(id: string, executor?: PoolClient): Promise<QueryResult>;
