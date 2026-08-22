// Selects which schema the leads feature reads and writes.
//
// The database holds two: the live `exchange` schema, and the
// domain-namespaced schemas a migration is moving toward. Leads is the first
// feature to move, and it moves behind this switch rather than behind a deploy:
//
//   LEADS_SOURCE=exchange   (default) reads and writes exchange.leads
//   LEADS_SOURCE=core                 reads and writes core.leads
//
// Nothing above this file knows the difference - the service, controller and
// routes are untouched, and both implementations satisfy the same contract.
// Rolling back is an environment variable, not a revert and redeploy.
//
// Before flipping to core, run migration 003 to bring core.leads up to date,
// and `pnpm --filter @dorado/api diff:leads` to confirm the two return
// identical responses. Once core has been serving for long enough to trust,
// repo.exchange.js and this switch both go away.
import * as exchange from "#features/leads/repo.exchange.js";
import * as core from "#features/leads/repo.core.ts";

const SOURCE = process.env.LEADS_SOURCE === "core" ? "core" : "exchange";

const impl = SOURCE === "core" ? core : exchange;

export const activeSource = SOURCE;

export const getLead = impl.getLead;
export const getAllLeads = impl.getAllLeads;
export const createLead = impl.createLead;
export const updateLead = impl.updateLead;
export const deleteLead = impl.deleteLead;
