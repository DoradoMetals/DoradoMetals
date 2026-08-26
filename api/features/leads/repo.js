// Selects which schema the leads feature reads and writes.
//
// The database holds two: the live `exchange` schema, and the
// domain-namespaced schemas a migration is moving toward. Leads moves behind
// this switch rather than behind a deploy:
//
//   LEADS_SOURCE=exchange   (default) read exchange, write exchange
//   LEADS_SOURCE=dual                 read leads.leads, write BOTH
//
// Go through `dual` and stay there. It is the only setting other than the
// default, and the only reversible one: exchange keeps receiving every write,
// so falling back to it loses nothing. A setting that read and wrote the new
// schema alone would be a one-way door - exchange stops being updated the
// moment it is flipped, and flipping back silently drops everything written in
// between - which is why there isn't one.
//
// Promotion sequence:
//   1. run migrations, then `pnpm --filter @dorado/api diff leads` until clean
//   2. LEADS_SOURCE=dual, and leave it for long enough to trust
//   3. re-run the diff periodically; it should stay clean while dual is live
//   4. stop here. There is no third setting: writing only to the new schema
//      is the one-way door, and CLAUDE.md says to go through dual and stay
//      there. Dropping exchange.leads and this switch is a separate,
//      deliberate change once nothing needs to fall back.
//
// Nothing above this file knows the difference - service, controller and routes
// are untouched, and both implementations satisfy the same contract.
import * as exchange from "#features/leads/repo.exchange.js";
import * as dual from "#features/leads/repo.dual.ts";

// An unrecognised value is NOT an error: the Object.hasOwn check below falls
// back to `exchange`, silently. So a setting listed here that SOURCES does not
// contain reads as a working promotion and is not one.
const SOURCES = { exchange, dual };

// Anything unrecognised falls back to the schema currently serving traffic.
const SOURCE = Object.hasOwn(SOURCES, process.env.LEADS_SOURCE ?? "")
  ? process.env.LEADS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getLead = impl.getLead;
export const getAllLeads = impl.getAllLeads;
export const createLead = impl.createLead;
export const updateLead = impl.updateLead;
export const deleteLead = impl.deleteLead;
