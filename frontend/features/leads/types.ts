// Leads, FROM THE CONTRACTS (phase 3, ruling 39).
//
// The hand-written `Lead` claimed `phone`, `email`, `contact` and `notes` as
// required strings against four NULLABLE columns, and typed the timestamps as
// `Date` against a wire that sends strings. `NewLead` was a second, different
// guess at the create body.
import type { Lead as LeadContract, CreateLeadBody, LeadPatch as LeadPatchContract } from '@dorado/contracts'

export type Lead = LeadContract

// The create body, as the API's own statement takes it.
export type NewLead = CreateLeadBody

// The update body's `patch`: the ten columns leads.update() writes
// (api/db/leads/repo.ts PATCHABLE), now the contract's own export.
export type LeadPatch = LeadPatchContract

// *** NOT A CONTRACT, AND DELIBERATELY SO - D103's second arm. ***
//
// `leads.leads.priority` is plain `text DEFAULT 'Medium'` with no check
// constraint and no enum, so this union is enforced NOWHERE: a row may
// legitimately hold any string, and the contract types the column `string`
// because that is what the database says. What this list actually is, is the
// set of priorities THE SELECTOR OFFERS - a UI decision, which is why it lives
// beside the selector rather than in a shape both sides import.
//
// That is also why the two read sites cast: `(lead.priority ?? 'Medium') as
// LeadPriority` narrows a real string down to what the dropdown can render.
// The cast is honest about the gap. Closing it properly is D103's fix - make
// the column a real enum on the leads schema and regenerate - which is a
// migration, and migrations are not this wave's to write.
export type LeadPriority = 'High' | 'Medium' | 'Low'

export const LEAD_PRIORITIES: LeadPriority[] = ['High', 'Medium', 'Low']
