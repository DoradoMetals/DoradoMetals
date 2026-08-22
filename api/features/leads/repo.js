// Selects which schema the leads feature reads and writes.
//
// The database holds two: the live `exchange` schema, and the
// domain-namespaced schemas a migration is moving toward. Leads moves behind
// this switch rather than behind a deploy:
//
//   LEADS_SOURCE=exchange   (default) read exchange, write exchange
//   LEADS_SOURCE=dual                 read core,     write BOTH
//   LEADS_SOURCE=core                 read core,     write core
//
// Go through `dual` and stay there. It is the only setting that is reversible:
// exchange keeps receiving every write, so falling back to it loses nothing.
// Going straight to `core` is a one-way door - exchange stops being updated the
// moment it is flipped, and flipping back silently drops everything written in
// between.
//
// Promotion sequence:
//   1. run migrations, then `pnpm --filter @dorado/api diff leads` until clean
//   2. LEADS_SOURCE=dual, and leave it for long enough to trust
//   3. re-run the diff periodically; it should stay clean while dual is live
//   4. LEADS_SOURCE=core once you are willing to stop maintaining exchange
//   5. drop exchange.leads, delete repo.exchange.js and this switch
//
// Nothing above this file knows the difference - service, controller and routes
// are untouched, and all three implementations satisfy the same contract.
import * as exchange from "#features/leads/repo.exchange.js";
import * as next from "#features/leads/repo.next.ts";
import * as dual from "#features/leads/repo.dual.ts";

const SOURCES = { exchange, dual, next };

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
