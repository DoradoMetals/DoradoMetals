import { z } from "zod/v4";
import { LeadsRow } from "../generated/leads.js";

// SOURCED FROM THE LIVE `leads` SCHEMA, NOT `exchange`. This used to import
// exchange's LeadsRow - the two happen to carry the same columns today, but
// leads.leads (with created_by_id/updated_by_id, the audit_stamp trigger's
// own columns) is the table this feature actually reads and writes; the
// exchange copy is frozen (ruling 36) and drifting from it is only a matter
// of time.
export const Lead = LeadsRow;
export type Lead = z.infer<typeof Lead>;

// POST /leads/create - WHAT THE STATEMENT ACTUALLY TAKES.
//
// created_by/updated_by are NOT fields here at all (item 4): public.audit_stamp
// writes both from the connection's actor, and a body naming either is a
// caller claiming to be somebody else - the controller now refuses it by name
// rather than accepting and discarding it.
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
  priority: LeadsRow.shape.priority.optional(),
  notes: LeadsRow.shape.notes.optional(),
});
export type CreateLeadBody = z.infer<typeof CreateLeadBody>;

// PATCH - the ten columns leads.leads actually allows to change (repo.ts's
// own PATCHABLE), all optional (a patch names only what it changes).
// created_by/updated_by/created_by_id/updated_by_id are absent on purpose -
// see CreateLeadBody's header.
export const LeadPatch = LeadsRow.pick({
  name: true,
  phone: true,
  email: true,
  last_contacted: true,
  converted: true,
  contacted: true,
  responded: true,
  contact: true,
  notes: true,
  priority: true,
}).partial();
export type LeadPatch = z.infer<typeof LeadPatch>;
