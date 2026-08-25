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
schema serving all traffic. **Eighteen** domain-namespaced schemas — `orders`,
`payments`, `fulfillments`, `shipping`, `refiners`, `tax`, `places`, `auth`,
`products`, `organizations`, `metals`, `spots`, `media`, `leads`, `rates`,
`reviews`, `checkout`, `auctions` — were built in a January 2026 refactor
abandoned at 3 of 24 features, and are being migrated to one at a time. Use the
`migrate-feature-schema` skill.

`checkout` and `auctions` were missing from this list until August 2026, and
with them the carts. `exchange.carts`, `cart_items`, `sell_carts`,
`sell_cart_items`, `auctions` and `auction_items` all hold production rows —
`sell_carts` has 65 — and none was counted among the features. Neither was
`exchange.account_transactions`: **a customer credit ledger, 17 rows, 8
customers, $66,999.32, with no destination in any of the eighteen.**
`audit:coverage` now reports every exchange table no feature claims, so this
cannot go unnoticed again.

**Every feature with data to migrate now has one, and none is promoted.** There
are **twenty-one** `*_SOURCE` switches, all defaulting to `exchange`, so nothing
has changed for live traffic: leads, rates, reviews, sales-tax, spots+metals,
media, refiners, carriers, services, pickups, shipments, tracking, products,
mints, purchase-orders, sales-orders, addresses, transactions, checkout, users,
payments. Promotion is deliberate and is the user's call.

**Two things are not a `*_SOURCE` switch and never will be.** `fulfillments`
(methods, pickups, directs) is capability `exchange` never recorded — there is
no source to read from, so a switch would have one state. `auth` is an atomic
cutover: better-auth writes `exchange` directly through its own pool via
`modelName`, so there is no reversible middle state to sit in.

**The shape a response leaves in is a second, independent axis.** Seven `*_WIRE`
switches — products, media, spots, refiners, carriers, addresses, payments — all
defaulting to `legacy`. `*_SOURCE` moves when the data is ready; `*_WIRE` moves
when the frontend is. Both repos return the new shape internally, and
`shared/wire/middleware.js` converts down at the edge, mounted as one line per
feature. Conflating the two axes is the mistake to avoid.

**Promotion is documented in `PROMOTION.md`** — the order of operations, what
each of the twenty-eight switches moves, and how to roll each one back. Written
against production as it actually is rather than against dev.

**Production can be built from nothing.** `000_genesis_schema.sql` creates every
schema, table, view, enum and function; the backfills derive the data from
`exchange`; `047_seed_reference_data.sql` supplies what `exchange` never held
(the business's own organization, locations, opening hours, payment and
fulfillment methods, employees). Verified by building it all into renamed
schemas inside a rolled-back transaction — see Verification below.

**Dev and production are the same Postgres instance**, different databases —
`dev` and `prod`. `DATABASE_URL` in `api/.env` is dev.
`PROD_READONLY_DATABASE_URL` is read-only production, for audits only.

Schema changes go through `api/migrations/*.sql`, applied by
`pnpm --filter @dorado/api migrate`. Never apply to production — leave that to
the user.

## Tests

The API's tests run against real Postgres, each inside a transaction that is
rolled back, and need `TZ=UTC` — `pnpm --filter @dorado/api test`.

The frontend uses vitest, `pnpm --filter @dorado/frontend test`, and is unit
tests only: pure functions, and the shapes the API contract depends on. There is
deliberately no browser or e2e harness — that is a larger decision than a config
file. Both run under `pnpm check`.

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

**Nothing irreversible goes inside one.** A transaction can be rolled back; an
email, a Stripe charge and a FedEx label cannot. Do the database work, commit,
then act on the outside world. `sendOrderToSupplier` emailed a refiner their
copy of a sales order as the first statement of a transaction that went on to
fail — leaving them shipping metal against an order nothing recorded.
`shared/db/transaction-side-effects.test.js` fails the build if one comes back.

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
  rolled-back transaction and compares it against dev, column by column, **and
  checks the committed `000_genesis_schema.sql` still matches what dev is.** It
  built from a live regeneration for months, so it proved the generator worked
  and never once read the file production is actually built from.
- `verify:backfill` — runs every backfill and seed into those empty tables and
  compares the rows against dev, then re-runs to prove idempotency, then checks
  the guard refuses once the new schema holds rows `exchange` does not.
- `verify:parity` — source table against target, type-aware.
- `diff` — every migrated read, old implementation against new.
- `validate:wire` — real responses parsed through the wire contracts, **for
  both implementations**, not just whichever the switch currently selects. The
  contract only matters if it survives promotion, and until this checked
  `repo.next` too it had only ever proven `exchange`. Orders were the last
  feature with no contract at all and the last checked one way; they now go
  through `bothWays` like everything else. Contracts describe the wire, so
  timestamps are strings — the comparison runs on
  `JSON.parse(JSON.stringify(row))`.
- `audit:coverage` — **every populated column in `exchange` that has nowhere to
  go.** Run this before splitting any repo. Orders had matching row counts and
  was missing 21 columns of live data; row counts are not evidence.
- `compare:databases` — **two databases, table by table, row counts and content
  hashes, plus every sequence.** Written for the step where `test` is restored
  from a production dump: `pg_restore` reports errors it recovered from and can
  exit 0 having quietly dropped a table's data, so "it restored" is not
  evidence. Refuses when both URLs resolve to the same database, because a
  comparison of something with itself always passes, and fails when it compared
  no tables at all. Checked against a real difference — prod against dev reports
  91 differences across 76 tables.
- `audit:test-leaks` — **fingerprints every `exchange` table, runs the suite,
  and compares.** A test that calls a service does not contain it: the service
  opens its own transaction on its own pool connection and commits, while the
  test's rolls back. That is how `tracking.test.js` came to delete the real FedEx
  history of five dev shipments — the bug it was written to prevent, committed by
  the test for it. Every assertion passed, because a test reads its own writes
  either way. Content-hashed rather than counted, because the same bug also
  overwrote two columns in place, which a row count cannot see.
  `--self-test` proves the detector works by updating one row inside a
  transaction it rolls back.
- `audit:precision` — **every column whose value the target's type would
  change.** Casts each source value into the type of the column it lands in and
  counts what differs. `orders.items` declared `purity numeric(4,3)` against an
  unconstrained source, so `.9999` fine gold was stored as `1.000`. Coverage
  passed — the column existed. Parity never looked — orders is a merge, not a
  pair. Run it with `--prod`: dev held three of these and production eighteen.

A reported gap is often a rename or a relocation rather than a loss — seven of
shipping's thirteen were, and three of addresses'. Check before adding a column,
and declare the mapping in `scripts/lib/feature-map.mjs` so the report stays
honest. That map now also drives `audit:precision`, and it carries a second
kind of entry: `FLOWS`, for values a backfill moves into a table that does not
own them. `orders.items` takes its weights from `exchange.products` via a
`coalesce`, which is a value flow and not an ownership mapping — and that
omission is exactly how the rounding went unseen.

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

- **Bank details are unencrypted at rest, and production has fourteen of
  them.** Confirmed against production: of 61 payouts, the 10 ACH and 8 WIRE
  rows carry real routing and account numbers in plaintext. Dev has none, which
  made them look vestigial — they are not. The payments migration must not copy
  them into `payments.details`, which would double the exposure.
- **One feature genuinely blocked**: auth. better-auth writes `exchange`
  directly via `modelName` through its own pool, so there is no reversible
  middle state to sit in. Payments was listed here as blocked and is not — it is
  a different model rather than a reshaping, and splitting it turned out to be
  possible without deleting anything: 062 had already reconciled the new schema
  to `exchange`, and 074 derives the rest from the Stripe export.
- **Production has no record of $126.48 it was paid.** Three Stripe intents were
  captured and `exchange.payment_intents` records `amount_received` as null or 0
  while still saying `requires_payment_method`; two further charges have no row
  at all. Nothing is lost — Stripe has the money and Stripe is right — but the
  webhook that updates `exchange` is not reliably landing, and the visible
  symptom is a checkout that fails at the last step because the API offers back
  an intent Stripe will not confirm. `audit:payments` prints the list.
- **No production migration has been run, and no `pg_dump` taken.** The dump
  comes first.
- Docker images are unverified — no daemon in the dev environment.
