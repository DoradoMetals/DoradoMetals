# Migration plan — continue, do not restart

Jacob, 2026-09-02: *"we don't need to restart. We can continue with the
migration just updated with this idea in mind."*

## What restarts

The eighteen January schemas, replaced feature by feature as the migration
reaches them, and the API's repos and orchestration, rewritten against the
new model use case by use case. That code was `exchange` renamed with
namespaces; migrating it costs more than rewriting it, because every use
case changes anyway.

## What stays, and it is most of the value on the branch

- **`exchange`**, untouched, the source every backfill reads. Same covenant.
- **`auth`.** Cut over, pinned at better-auth 1.6.9, mirrored, working.
- **The providers** — FedEx, Stripe, Places, email. No opinion about schema.
- **The verification tooling** — `verify:genesis`, `verify:backfill`,
  `verify:parity`, `audit:coverage`, `audit:precision`, `audit:test-leaks`,
  `audit:silent-mutations`, `lint:db`. These are what make a redesign safe.
  The cost is re-pointing `scripts/lib/feature-map.mjs` at the new tables,
  and it is the same cost whether one table changes or twenty — so change
  the model once.
- **Logging, the transaction side-effect test, the lint scripts.**
- **The frontend, its contracts pipeline and the e2e specs** — kept, but
  they inform nothing. See below.

## The sequence

1. **This document.** Done. FOLLOWUPS D213 carries the rulings.
2. **The restructure** (Jacob: *"After that we should do the restructure"*).
   Mechanical: `features/` splits into `db/` (repos and their `sql/`, with
   their tests) and `domain/` (everything else), `http/` takes routes and
   controllers, the `#db/*` `#domain/*` `#http/*` import roots land, and
   `lint:layers` starts failing the build on a crossed boundary. No behaviour
   changes, URLs do not move (ruling 13), the suite stays green. The tooling
   that hardcodes `features/` (`feature-map.mjs`, `lint:db`,
   `audit:silent-mutations`, the skills, CLAUDE.md) is re-pointed in the same
   pass — several audits carry a floor precisely because a scan that walks
   zero files looks clean.
3. **Genesis, per feature as reached.** No production migration has ever
   run, so the January tables are replaced, not migrated from. Build the new
   schemas beside the old on dev as this project always has; retire a
   feature's January tables once its backfill verifies. `verify:genesis`
   keeps the committed file honest.
4. **Backfills from `exchange`** into the new model, verified by the existing
   tooling. This is where "how does an `exchange` order become lots,
   measurements, lines and a frozen spot" is answered concretely, and where
   the model proves it can hold the real history. `exchange.scrap`'s
   `*_actual` columns become `assayed` rows; declared weights become
   `declared` rows; `refiners` values become refiner orders and pool credits.
5. **The API, feature by feature against the model,** tests first, the
   feature's `db/` `domain/` `http/` rewritten together with its tables and
   backfill (coupled features in the same pass — the standing ruling). The
   order to take them in is the order the business runs:
   checkout → place → fulfil → receive → refine → settle → pay.
6. **The frontend updates to match, per surface, after each API surface
   lands.** The API does not care what the frontend has or wants.
7. **Then UAT** on a production dump, the full chain rehearsed there, then
   CI/CD — the plan that already exists.

## The frontend informs nothing

Jacob: *"fuck the frontend. It's not as important as the API. It can adjust
to this new model and shape after we write the code. Don't let the frontend
inform our decision making on the api AT ALL. We should be fully ignoring
the legacy frontend."*

And, restated as the working rule (Jacob, same day): **the frontend must
update to match the API; the API shouldn't care what the frontend has or
wants.** Consequences, so no session re-imports the old constraint:

- No API design fork is decided by what the frontend currently reads.
- Wire shapes change as the model changes. The standing rule "never change
  a wire shape during a schema migration" was written for the
  `exchange` → January move and **does not apply** to this redesign.
- The frontend's zod schemas, hooks and components are adapted after the
  API surface they read is written. The e2e specs are how regressions are
  found, not how the API is shaped.

## What dev loses, and it is decided

Dev's new schemas hold every write since the pivot on 2026-09-02, and those
rows exist nowhere else. They are test data. Rebuilding a feature's tables
from `exchange` loses them. Fine — but Jacob confirms it when the rebuild
happens, per table, rather than discovering it.

## What must not change

- `exchange` is never dropped, truncated or written by the backfills.
- No migration runs against production. `pg_dump` first, then migrations,
  then backfills, then `verify:parity` and `compare:databases`, then merge.
  Not before, and not by an agent.
- Bank details never reach a log or a wire. The sealed `payments.details`
  envelopes (D210) move to `transactions.details` unchanged.
