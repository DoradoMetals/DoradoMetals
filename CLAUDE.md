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

**Legacy CODE and legacy DATA are now different rules, and conflating them is
what made this section read as more restrictive than it is (Jacob, 2026-08-28).**

- **Legacy code is disposable once proven.** Read paths, dual-write mirrors,
  `*_SOURCE` switches, oracle tests: delete them when the feature's data
  migration has been verified. Git has them. Orders is proven and its read
  paths are already gone.
- **Legacy TABLES stay.** No migration drops an `exchange` schema or table -
  not on dev, not on prod. They cost disk and nothing else, and they are the
  source every backfill reads from.

**THE DEPLOY HAS A REQUIRED ORDER, and it is not a code problem.** The orders
read pivot landed in `a12b76ed`: there is no fallback to `exchange` any more.
Production's new schemas hold the abandoned January refactor - `orders.orders`
has 60 rows whose newest is 2026-01-12, while `exchange` has 72 orders with
writes through 2026-08-24. So merging this branch to `master`, which
auto-deploys, would serve customers a January snapshot. Removing the
dual-writes makes it worse: `exchange` also stops receiving writes, so the
business's history and its new orders end up in different tables.

**PRODUCTION IS MISSING EIGHT OF THE EIGHTEEN SCHEMAS ENTIRELY** — not
missing data, missing the schemas: `products`, `organizations`, `metals`,
`spots`, `media`, `leads`, `rates`, `reviews`. It has ten: orders, payments,
fulfillments, shipping, refiners, tax, places, auth, checkout, auctions.
Verified read-only against `PROD_READONLY_DATABASE_URL` on 2026-08-29.

So this is not "deploy and backfill". Code that queries a missing schema raises
**42P01 immediately**, and at least one such path is on the money:
`features/quotes/service.ts:416` calls `checkoutRepo.findProductIdByName`,
which is `SELECT id FROM products.bullion` **with no switch in front of it** —
on the endpoint that prices every customer-visible number. It arrived in
`d2926fd0`, which is on this branch and has never been deployed, so it is a
deploy blocker rather than a live outage. Deploying without step 2 below turns
it into one.

Before this branch is deployed:

1. `pg_dump` production. Still outstanding, and the prerequisite for the rest.
2. Run the migrations against production — **including the eight missing
   schemas**, which is most of `000_genesis_schema.sql`.
3. **Run the backfills.** This is the step that makes the read pivot safe.
4. `verify:parity` and `compare:databases` against production. Note that
   `verify:parity` only covers the pairs listed in its own `PAIRS` array — it
   was fifteen at the time of writing, and it had never included the carts or
   scrap, which is how a covenant came to name an instrument that could not
   answer (D130).
5. Only then merge.

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
packages/contracts/  @dorado/contracts  zod schemas, imported by api only
```

The frontend imports `@dorado/contracts` as its ONLY source of table-derived
shapes — types and, since the zod/v4 unification, the runtime schema objects
themselves (Jacob's single-source ruling, executed 2026-08-28). Frontend
files keep local names for UI concerns and alias contract imports as
`<Name>Contract` on collision. An earlier version of this paragraph said the
frontend imported the contracts nowhere and its hand-written types were
"checked against nothing" — true when written, and the gap
`audit:wire-readiness` was built to measure; the audit now measures a
finished thing.

`api` uses subpath imports — `#features/*`, `#shared/*`, `#providers/*`,
`#legacy/*`, `#db`. Never a relative path that crosses between two of those
roots.

## How a feature is laid out

**Every RESOURCE gets the full stack, and the parent MOUNTS rather than
declares** (Jacob, rulings 26b/26c). A sub-resource is not a passive table
hanging off its parent; it has consumers of its own, and the whole point is
that a consumer in another feature can depend on one resource without dragging
in its siblings.

```
features/fulfillments/
  routes.ts        mounts the children, declares only what SPANS them
  controller.ts    HTTP in, HTTP out - the thin remainder
  service.ts       the domain logic that genuinely spans children
  repo.ts + sql/   the fulfillments.fulfillments table
  methods/
    routes.ts      its own paths;  the parent does router.use("/methods", …)
    controller.ts
    service.ts     the orchestrator for THIS resource
    repo.ts + sql/
  pickups/ directs/ shipments/   … same shape
```

Checkout asks for fulfillment methods and reaches `fulfillments/methods/`
**directly**, never through `fulfillments/controller.ts`. That is the edge the
factoring exists to keep thin.

**THE PATHS DO NOT CHANGE** (ruling 13 — the URL and the file answer different
questions). `POST /api/fulfillments/schedule_pickup` is declared in
`fulfillments/pickups/routes.ts` and mounted at `/`; `PATCH
/api/orders/items/:id` is declared in `orders/items/routes.ts`. Factoring a file
is never a reason to move a URL.

**The parent's test, applied AFTER every child has its stack**: does this
handler genuinely span children? Very little does. `cancelSchedule` does (a
booking is a pickup *or* a direct and the caller does not say which);
`getSchedule` does (both tables, one timeline); `setMethod` does (it deletes the
detail row of the category being left). Everything else moved.

**A resource with no HTTP surface gets a service and says so in its header.**
`fulfillments/shipments`, `orders/transactions`, `refiners/spots` have one
consumer each and it is another service. Writing empty `routes.ts` files for
them would be ceremony. The header states the decision so the next session does
not read the gap as unfinished work.

**Reads resolve from the parent path; writes key by the resource's own id.**
`GET /api/orders/:orderId/pickups` is declared by `orders/routes.ts` because the
order id is the key the caller holds — but the HANDLER lives in
`fulfillments/pickups/controller.ts`, because that feature owns the table.

**Tests live with their feature, grouped under `tests/`** (ruling 31):
`features/<feature>/tests/*.test.*`. A test whose subject moves moves with it,
in the same pass — factor, move, rename is one diff per file, not three.

## `api/legacy/` — the dual-write mirrors, in one place

Jacob, refining ruling 29: *"Move all legacy code to a folder called `legacy`
that is a sibling to `features`."* One directory, mirroring the feature names,
so that **promotion deletes one directory** rather than hunting thirteen.

```
legacy/<feature>/repo.ts     the exchange half of that feature's dual write
legacy/<feature>/sql/*.sql   its statements
legacy/README.md             entry and exit criteria, in full
```

Imported as `#legacy/<feature>/repo.ts`. `features/` may import `legacy/`;
`legacy/` should not import `features/`, and the threads that remain are named
in `legacy/README.md`.

**What is NOT in there**: legacy TABLES (they never move and never drop), and
anything still load-bearing for a live path. `features/checkout/repo.exchange.js`
and `features/payments/repo.exchange.js` are still the implementation their
`*_SOURCE` switch selects, so they are not legacy yet whatever they are named.
Moving something into `legacy/` is a statement that it is on death row.

### Before deleting a feature's legacy code — the checklist

Jacob: *"delete as we go. If it hasn't been completed it shouldn't be deleted."*
Completion is about DATA, not about the suite being green.

1. **`pnpm --filter @dorado/api verify:parity`** for every table pair the
   feature owns — and read the exchange-only row count, which is the number that
   matters. Zero means the new schema has everything.
2. **`pnpm --filter @dorado/api audit:coverage`** — every populated column has
   somewhere to go. Orders had matching row counts and was missing 21 columns of
   live data; row counts are not evidence.
3. **The decomposition gate**, where the feature has one
   (`verify:orders-decomposition`, `verify:sales-order-decomposition`).
4. **The reads have pivoted** — the feature reads the new schema and there is no
   fallback left.
5. **Only then** delete its read paths, its `*_SOURCE` machinery and its oracle
   tests, and move what still dual-writes into `legacy/<feature>/`.
6. **The WRITE half is a separate, later decision, and it is Jacob's.** Deleting
   a dual-write is a ONE-WAY DOOR: `exchange` stops receiving that feature's
   writes and flipping back loses everything written in between. It is gated on
   promotion past `dual`, which is gated on the production backfills having run.

**"The tests pass" is not evidence that data migrated.** A test reads its own
writes either way.

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

**The wire axis is RETIRED (2026-08-28).** There were seven `*_WIRE` switches
— products, media, spots, refiners, carriers, addresses, payments — and all
seven features (plus orders, which never had a switch) are CONVERTED: the
frontend reads every response shape from `@dorado/contracts`, the adapters
and `shared/wire/lift.ts` are deleted, and `audit:switches` asserts the
zero-state. A wire rollback would now break the frontend rather than save
it. What remains is the `*_SOURCE` axis alone — data readiness, Jacob's
promotion decisions. The frontend also computes NO money: every
customer-visible number comes from the `/quotes/*` endpoints (D81–D84).

**Promotion is documented in `PROMOTION.md`** — the order of operations, what
each `*_SOURCE` switch moves, and how to roll each one back; its wire section
stands as the record of what each conversion changed. Written against
production as it actually is rather than against dev.

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
rolled back, and need `TZ=UTC` — `pnpm --filter @dorado/api test`. They live
with their feature, grouped under `features/<feature>/tests/` (ruling 31), and
a test whose subject moves moves with it in the same pass.

The frontend uses vitest, `pnpm --filter @dorado/frontend test`, in two lanes:
pure functions and contract shapes run in plain node, and component render
tests (`*.test.tsx`) run under jsdom with testing-library — added 2026-08-27 as
part of the feature-by-feature conversion, with jsdom's gaps shimmed once in
`vitest.setup.ts`. Both run under `pnpm check`.

There is ALSO a Playwright e2e harness — eleven specs under
`pnpm --filter @dorado/frontend e2e`, driving a real browser against a live
API. An earlier version of this paragraph said there was "deliberately no
browser or e2e harness"; that had stopped being true and the claim was
repeated unverified for some time. E2e specs are excluded from vitest twice
over and do not run in `pnpm check`.

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
  `JSON.parse(JSON.stringify(row))`. **It also refuses a field no contract
  declares.** zod strips unknown keys rather than rejecting them, so a
  projection that grew a column parsed clean and reached the wire unnoticed —
  which is the hazard `features/products/constants.bullion.ts` names in its own
  comment. Zero of the 61 shapes have one, so refusing costs nothing; if it
  fires after a deliberate addition, regenerate the contracts.
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
- `audit:frontend-nullability` — **every field the frontend requires that the
  database allows to be absent.** The frontend keeps its own zod schemas (see
  `audit:wire-readiness`), and three of them are `.parse()`d on the checkout
  path, so one can reject the API's own data. 77 fields compared against
  production, 31 stricter, **17 in schemas parsed at runtime** — none live, and
  measured: 247 production rows, not one null. A mismatch is not automatically
  a defect and the report says so; a form schema *should* be stricter than its
  column. Two guards earn their keep: it prints how many of a schema's fields
  are really columns of the mapped table (`pickupSchema` matched 0 of 6 and had
  been reporting clean), and dropping `serviceSchema` killed a false alarm
  where a FedEx rate quote shared only the word `code` with
  `carrier_services` — the third shared-name false finding on this project.
- `audit:wire-readiness` — **the other half of the promotion rule.** `*_WIRE`
  moves "when the frontend is ready", and nothing measured that. It counts the
  legacy field names the frontend still reads: media, spots, products,
  carriers, refiners and addresses are CONVERTED (contracts types, render
  tests, adapters deleted, 2026-08-27) - all three renames and all three
  lifts, with shared/wire/lift.ts deleted behind them. The audit reports 0
  switches that would break the frontend today; payments is the one adapter
  and the one `?` left. The count is
  **split into product code and test fixtures** — SPOTS_WIRE, before its
  conversion, was 76 real reads and 10 fixtures — because a test spelling the
  legacy name is a real occurrence but not a component reading the wire, and
  counting them together made the metric move the wrong way when tests were
  written: SPOTS_WIRE drifted from 83 to 86 purely on frontend *test*
  commits, with the product code untouched. The switch this endangered was
  `MEDIA_WIRE`, the one reporting ready at 0. The frontend now imports
  `@dorado/contracts` ONLY in converted features, so `tsc` sees those renames
  from both sides — everywhere else it still cannot. Payments' adapter is structural and one rename (`type`) is too
  common to count globally — those report `?`, never `yes`, because a scan that
  cannot see something must not call it clean. `--self-test` proves the file
  floor fires; the first version walked zero files and called every switch
  ready.
- `audit:indexes` — **every access path `exchange` indexes that the new schema
  does not.** `audit:constraints` reads `pg_index` but filters on `indisunique`,
  so the plain indexes had never been looked at at all. Uniqueness is a
  correctness guard and something eventually raises 23505 when it goes; a plain
  index going produces no error at all — same rows, same order, sequential scan.
  Nothing downstream sees it either: `diff` compares output not plans,
  `verify:parity` compares rows, `validate:wire` compares shapes, and all three
  pass against a table with no indexes whatsoever. The only symptom is latency,
  and dev holds tens of rows where a seq scan is genuinely the faster plan — so
  the symptom first appears as production row counts arriving at a schema nobody
  measured. Asks the access-path question, not the uniqueness one: does any
  target index **lead** with the column the source index leads with. Found
  `media.images(user_id, created_at)` — the index behind "list my images", on the
  one feature `audit:wire-readiness` says is clear to promote — and
  `tax.sales_tax(state)`, which both live sales-tax queries key on. Three more
  are named in `ACCEPTED` with the query that makes each a non-issue, pinned from
  both sides so a new gap fails and a fixed one forces the entry out.
- `audit:query-paths` — **the other direction of the index question.**
  `audit:indexes` is source-driven: it walks `exchange`'s indexes and asks
  whether each survived. It is blind by construction to a lookup `exchange`
  never had — a `WHERE` written fresh in a `repo.next.ts` has no source index to
  be compared against, so no comparison happens. This one starts from the
  queries: every parameterised equality filter in code touching the eighteen
  schemas, checked for whether any index on that table **leads** with a column
  the query filters on. It caught `payments.attempts.provider_ref`, which
  `audit:indexes` had reported and I had **wrongly** dismissed — the live query
  is `WHERE a.intent_id = i.id AND a.provider_ref = $3`, and `a.intent_id = i.id`
  is a join condition, not a narrowing filter, so there was no seek at all where
  `exchange` sought through `UNIQUE(provider_ref)`. On the Stripe webhook path.
  Fixed in 082. **The unit is the query, not the column** — a `WHERE` filtering
  `user_id AND direction` is served by an index leading with `user_id`, and
  asking per column called that unindexed twice over. Views are excluded (they
  carry no index); an unresolvable alias reports `?`. Guarded by a literal floor
  **and** a known-present control, because the floor alone missed partial
  breakage: dropping three of eighteen schemas still left 113 literals and
  reported clean.
- `audit:enum-domains` — **text values that are compared against an enum, and
  are not labels of it.** `exchange.products.product_type` is text, and so is its
  successor `products.bullion.type` — but the sales-tax rule match does
  `r.product_type IN ($3, 'All')` against a column that *is* an enum. Postgres
  must coerce, and a value that is not a label does not fail to match, it raises
  **22P02 and the whole tax calculation throws**. Nothing checked the coupling
  because it is not a foreign key and not a constraint: two columns in different
  tables that must agree by value, with the type declared on only one of them.
  `audit:precision` casts a source value into *its own* target's type, which
  here is text, so it is clean — the value only becomes invalid somewhere else.
  Found two production products carrying `E'\n\tBar'`, a newline and a tab in
  front of "Bar". **`btrim()` does not report them** — its default character set
  is spaces only. Not reachable today (both `display = false`, stock 0, no order
  line references either) but `get_product_types` is `SELECT DISTINCT` with no
  filter, so the admin dropdown offers the corrupt value beside the real "Bar".
  Exits non-zero by design while it is outstanding, like `audit:payments`, and
  is **not** in `pnpm check`: fixing it is an UPDATE against production. D39.
- `audit:precision` — **every column whose value the target's type would
  change.** Casts each source value into the type of the column it lands in and
  counts what differs. `orders.items` declared `purity numeric(4,3)` against an
  unconstrained source, so `.9999` fine gold was stored as `1.000`. Coverage
  passed — the column existed. Parity never looked — orders is a merge, not a
  pair. Run it with `--prod`. **Both now report 0** across 57 type differences
  examined — the eighteen and the three are genuinely fixed, `orders.items.purity`
  having been widened from `numeric(4,3)` to unconstrained. **But the fix moved
  the constraint to the source, where this audit cannot see it**: it casts a
  source value into the *target's* type, so a loss that already happened at the
  source is invisible by construction. `exchange.scrap.purity` and
  `purity_actual` are still `numeric(4,3)`, `0.9999::numeric(4,3)` is `1.000`,
  and production holds 16 products at .9995/.9999 against a scrap column whose
  commonest value is exactly 1.000. `purity_actual` multiplies into
  `content_actual`, which is what a customer is paid on. D61.

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

## Where things stand (2026-08-28, end of the conversion push)

Nineteen commits landed 8/27-8/28 (media c00c0b56 ... downloads 4ea0fa9a).
The FRONTEND CONVERSION IS COMPLETE: every wire converted, every
table-derived schema imported from `@dorado/contracts` as VALUES with plain
names (no -Wire/-WireNext), zero client-side money math (the `/quotes/*`
endpoints price everything), the paper trail live end to end. Read
FOLLOWUPS.md D77-D86 for the record and BOTH "Jacob's rulings" sections
(2026-08-28 evening + afternoon) for the standing design law: statuses are
pure customer-facing labels driving no logic; offers are fully dead
(vocabulary included); customers have zero post-placement order options;
one endpoint per resource, owned by the feature that owns the table;
coupled features convert in the same pass; shared UI components lift as
surfaces are touched (structure now, styling later); admin order drawers
are interim UI (future: one page, all statuses).

**IN FLIGHT, UNCOMMITTED (D87 + D88)**: the working tree carries a
three-agent series - (1) the order-mutation surface consolidation:
`PATCH /purchase_orders/:id` + `PATCH /sales_orders/:id` replace the
~25-route RPC zoo, admin-only, field-named 403s, `finalize_pricing` and
`cancel` as explicit ops, 'Accepted'/'Offer Sent'/'Rejected' leave the
lifecycle with row migrations; (2) the `refiners.orders` engagement entity
(owns pool values + refiner fee; items/spots key to it; migration +
guarded backfill; PATCH /refiners/orders/:id + /refiners/items/:id); (3)
four shared UI components (AccordionSection/SelectMenu/StatusChip/
UpdatedByline) adopted outside features/orders with a deferred-adoption
table for the orders tree. Frontend + lifter halves are DONE and verified
in-tree; the API half was still building at handoff. TO FINISH: read the
API agent's report, cross-check the refiners endpoint keying (frontend
keys items by ORDER ITEM id, engagements by refiner_order_id, guarded
no-op when null) and the additive `refiner_order_id` on the order wire,
run the full gate from the REPO ROOT, iterate, commit as a series, and
REVIEW FLAG for Jacob: the offers purge edited the Terms & Conditions
(legal copy - needs his eyes before deploy).

**Session mechanics that matter**: `pnpm check` must launch as a fresh
compound from the repo root (`pnpm
check > FILE 2>&1; echo "CHECK_EXIT=$?" >> FILE`) - chaining it after a
subdir cd has burned twelve attempts; read CHECK_EXIT from the file, never
the task notification. ScheduleWakeup timers DIE when WSL idles - keep a
background task alive (`sleep N` run_in_background) and let its completion
notification re-invoke; task notifications have never failed. Capture test
runs to files before grepping (SIGPIPE eats piped output). Subagents never
touch api/.env or git commits; lanes parallelize, the gate does not.

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
