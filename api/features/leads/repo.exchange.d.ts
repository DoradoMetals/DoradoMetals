import type { PoolClient, QueryResult } from "pg";
import type { LeadRow, NewLead } from "./repo.next.ts";

/**
 * Types the JavaScript exchange repo so TypeScript callers - the dual-write
 * phase in particular - get a real row type without the file having to be
 * converted. It returns the same shape as repo.next by construction: the two
 * tables have identical columns after migrations 002 and 004.
 *
 * THIS IMPORTED FROM ./repo.core.ts UNTIL 2026-08-26, AND THAT FILE WAS RENAMED
 * TO repo.next.ts IN 926c546d. An unresolved import in a declaration file is
 * not an error - every type it names silently becomes `any` - and
 * `skipLibCheck: true` means tsc never looked at this file to say so. So
 * repo.dual.ts, whose entire job is keeping the two implementations in step,
 * had NO type checking on the exchange half of it.
 *
 * Proved rather than assumed: with the stale path, `rows[0].nonexistent_field`
 * inside repo.dual.ts compiled clean. A first probe assigning the result to a
 * number DID error, which looked like the types were fine - but an unresolved
 * alias still prints under its own name, and `any[]` is not a number either.
 * The property access is what tells the two apart.
 */
export function getLead(id: string, executor?: PoolClient): Promise<LeadRow | undefined>;
export function getAllLeads(executor?: PoolClient): Promise<LeadRow[]>;
export function createLead(lead: NewLead, executor?: PoolClient): Promise<LeadRow>;
export function updateLead(lead: LeadRow, user_name: string, executor?: PoolClient): Promise<LeadRow>;
export function deleteLead(id: string, executor?: PoolClient): Promise<QueryResult>;
