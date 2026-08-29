import { z } from "zod/v4";
import { LeadsRow } from "../generated/exchange.js";

export const Lead = LeadsRow;
export type Lead = z.infer<typeof Lead>;

// POST /leads/create - WHAT THE STATEMENT ACTUALLY TAKES.
//
// This omitted `created_by` and `updated_by` and admitted five columns the
// create does not accept (`last_contacted`, `converted`, `contacted`,
// `responded`, `contact`) until phase 3. It mirrors
// api/features/leads/repo.ts's own `NewLead` now: name / phone / email are
// required, and the four the caller MAY supply are optional because
// create.sql defaults them - `COALESCE($7, 'Medium')` for priority, and its
// own comment says why the caller may legitimately send null.
//
// PRIORITY IS `z.string()` AND STAYS THAT WAY. `leads.leads.priority` is
// plain `text DEFAULT 'Medium'` with no constraint (genesis line 384), so a
// three-value union here would be D103's second arm: a constraint the
// database does not have, asserted by TypeScript alone. The frontend's
// High/Medium/Low list is the set its SELECTOR offers, which is a UI
// decision and lives beside the selector.
export const CreateLeadBody = LeadsRow.pick({
  name: true,
  phone: true,
  email: true,
}).extend({
  created_by: LeadsRow.shape.created_by.optional(),
  updated_by: LeadsRow.shape.updated_by.optional(),
  priority: LeadsRow.shape.priority.optional(),
  notes: LeadsRow.shape.notes.optional(),
});
export type CreateLeadBody = z.infer<typeof CreateLeadBody>;
