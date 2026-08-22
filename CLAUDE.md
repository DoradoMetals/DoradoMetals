# Dorado Exchange

A precious-metals exchange: customers sell scrap and bullion to the business
(purchase orders) and buy from it (sales orders). Real money, real bank details,
real FedEx labels.

## Do not lose data

The one rule that outranks everything else here. A bug is recoverable — deploy a
fix. Lost customer data is not: there is no undo, and no amount of correct code
afterwards brings back an order, a payout record, or a lead.

The invariant that makes the migration safe: **`exchange` holds every row the
business has, and nothing may overwrite, truncate or delete any of it.**
Migrations may read from it and add to it. New schemas are what get written.
`pnpm --filter @dorado/api lint:migrations` enforces this statically and runs in
CI; a genuinely intended destructive change needs an explicit
`-- allow-destructive:` marker saying why it is safe and what backup exists.

That invariant covers the whole migration up until a feature is promoted past
`dual`. After that, new rows live only in the new schema, and `exchange` being
intact no longer protects them.

This applies from the moment anything touches the database. Concretely:

- **Never `DROP` or `DELETE` without explicit confirmation**, and verify nothing
  references the target first. `order_metals.percent_change` and `scrap.gem_id`
  are 100% NULL and still read and written by live code.
- **Never apply a migration to production.** Migrations run against whatever
  `DATABASE_URL` points at, which is dev. Production is the user's to run.
- **Run `pnpm --filter @dorado/api verify:parity` before and after** any
  migration touching a table pair. It proves nothing was dropped, nothing was
  corrupted, and — importantly — whether the target holds rows the source does
  not, which means a backfill would overwrite them.
- **A backfill is only safe while the old schema is authoritative.** Once a
  `*_SOURCE` switch is promoted past `dual`, re-running one overwrites new rows
  with stale values. `verify:parity` refuses in that state.
- **Go through `dual` and stay there.** Reading and writing the new schema
  directly is a one-way door: the old schema stops receiving writes, and
  flipping back drops everything written in between.
- **When unsure, stop and ask.** A blocked migration costs an evening. A lost
  table costs the business.

## Layout

pnpm workspace, Node 24, deployed on Railway from `master` with auto-deploy.

```
api/                 @dorado/api        Express, ESM, mostly JavaScript
frontend/            @dorado/frontend   Next.js, TypeScript, strict
packages/contracts/  @dorado/contracts  zod schemas shared by both
```

`api` uses subpath imports — `#features/*`, `#shared/*`, `#providers/*`, `#db`.

## Two things to know before touching the database

**There are two schema designs in the same database.** `exchange` is one flat
schema serving all traffic. Sixteen domain-namespaced schemas — `orders`,
`payments`, `fulfillments`, `shipping`, `refiners`, `tax`, `places`, `auth`,
`products`, `organizations`, `metals`, `spots`, `media`, `leads`, `rates`,
`reviews` — were built in a January 2026 refactor abandoned at 3 of 24 features,
and are being migrated to one at a time. Use the `migrate-feature-schema` skill.

**Thirteen features are migrated and none is promoted.** leads, rates, reviews,
sales-tax, spots+metals, media, suppliers, carriers, products, mints,
purchase-orders, sales-orders, addresses. Each sits behind a `*_SOURCE`
environment switch defaulting to `exchange`, so nothing has changed for live
traffic. Promotion is deliberate and is the user's call.

**The remaining five are blocked on decisions, not on effort** — shipping,
payments, refiners, auth and fulfillments. Each is written up in FOLLOWUPS.md
with what specifically is unknown. They are not simply the later features; they
are the ones where the January work made a design decision nobody has confirmed
since.

**Production can be built from nothing.** `000_genesis_schema.sql` creates every
schema, table, view, enum and function; the backfills derive the data from
`exchange`; `047_seed_reference_data.sql` supplies what `exchange` never held
(the business's own organization, locations, opening hours, payment and
fulfillment methods, employees). Verified by building it all into renamed
schemas inside a rolled-back transaction — see Verification below.

**Dev and production are the same Postgres instance**, different databases —
`dorado_db_dev` and `dorado_db`. `DATABASE_URL` in `api/.env` is dev.
`PROD_READONLY_DATABASE_URL` is read-only production, for audits only.

Schema changes go through `api/migrations/*.sql`, applied by
`pnpm --filter @dorado/api migrate`. Never apply to production — leave that to
the user.

## Conventions

**Every query goes through the shared executor**, never `pool.query` directly:

```js
const { rows } = await query(sql, [id], executor);   // executor optional
```

The third argument is what lets a repo call join its caller's transaction.
Getting it wrong broke checkout in August 2026; `pnpm --filter @dorado/api
lint:db` now catches it.

**Transactions use the helper**, never hand-rolled BEGIN/COMMIT:

```js
return withTransaction(async (client) => { ... });
```

**Types come from generated contracts**, never hand-written. After any schema
change, regenerate — see the `verify-changes` skill.

**`NUMERIC` and `BIGINT` parsers are registered in `api/db.js`**, next to the
pool. They must stay there: anything importing the pool without booting the
server otherwise gets strings, and `price + fee` concatenates.

## Verification

`pnpm check` before committing — it takes over two minutes now, so background it
rather than letting a timeout kill it. Several validators need a database and
are not in CI. See the `verify-changes` skill for what each catches.

The ones that have actually caught things:

- `verify:genesis` — builds the whole schema into renamed schemas inside a
  rolled-back transaction and compares it against dev, column by column.
- `verify:backfill` — runs every backfill and seed into those empty tables and
  compares the rows against dev, then re-runs to prove idempotency, then checks
  the guard refuses once the new schema holds rows `exchange` does not.
- `verify:parity` — source table against target, type-aware.
- `diff` — every migrated read, old implementation against new.
- `audit:coverage` — **every populated column in `exchange` that has nowhere to
  go.** Run this before splitting any repo. Orders had matching row counts and
  was missing 21 columns of live data; row counts are not evidence.

A reported gap is often a rename or a relocation rather than a loss — seven of
shipping's thirteen were, and three of addresses'. Check before adding a column,
and declare the mapping in `scripts/audit-coverage.mjs` so the report stays
honest.

## Standing constraints

- **Never log or return bank details.** `exchange.payouts` holds routing and
  account numbers in plaintext. Order responses carry only last-4; full values
  come from an admin-only endpoint. Encryption at rest is outstanding.
- **Never change a wire shape** during a schema migration. The frontend is
  coupled to the current API surface; changing it is separate, deliberate work.
- **Never add `NOT NULL` from dev row counts.** Dev holds tens of rows. Use the
  production audit — `pnpm --filter @dorado/api audit:nullability`.
- **Verify before dropping.** `order_metals.percent_change` and `scrap.gem_id`
  are 100% NULL but still referenced by live code.
- `master` auto-deploys. There is no staging.

## Open threads

Full detail in FOLLOWUPS.md; these are the ones that block other work.

- **`claude_ro` fails authentication on production.** The most expensive
  blocker: it prevents the nullability audit *and* the query that would settle
  whether the plaintext bank columns hold anything. Needs
  `ALTER ROLE claude_ro PASSWORD ...`.
- **Bank details are unencrypted at rest — but in dev there are none.**
  `exchange.payouts.routing_number` and `.account_number` are null on all 16
  rows; every payout is ECHECK or DORADO_ACCOUNT. If production matches, the fix
  is to drop the columns rather than build encryption.
- **Five features blocked on decisions**: shipping (two product questions about
  services and packages), payments (a different model, not a reshaping),
  refiners and purchase-order `refinery_id` (which refiner — nothing in
  `exchange` records it), auth (better-auth writes `exchange` directly, so there
  is no reversible middle state), fulfillments (blocked behind shipping).
- **No production migration has been run, and no `pg_dump` taken.** The dump
  comes first.
- Frontend has no tests.
- Docker images are unverified — no daemon in the dev environment.
