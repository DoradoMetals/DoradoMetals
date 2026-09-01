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

**PRODUCTION IS NOT BEING TOUCHED, AND WILL NOT BE UNTIL THIS REFACTOR IS
PROVEN** (Jacob, 2026-08-29). No migration has ever run there and none will run
there on a schedule anyone but Jacob sets. Do not treat production state as a
blocker on this branch's work, do not plan around a deploy date, and do not
report production facts as though something is on fire — this section previously
read as a deploy checklist, which is why prod findings kept arriving as
blockers. They are not blockers. They are what will need doing eventually.

Recorded for that eventual day, verified read-only 2026-08-29: production holds
ten of the eighteen schemas and **lacks eight outright** — `products`,
`organizations`, `metals`, `spots`, `media`, `leads`, `rates`, `reviews`. So the
eventual sequence is not "migrate and backfill", it is "most of
`000_genesis_schema.sql` has never run there", and code touching a missing
schema raises 42P01 rather than returning empty. One such path exists today:
the quote surface resolves a product by name, and that read is
`SELECT id FROM products.bullion`. **The BYPASS that used to describe it is
closed** — `features/quotes/service.ts` no longer imports
`#features/checkout/repo.next.ts`; D147 moved the read to its owner,
`features/products/service.ts` `findProductIdByName`, and un-exported the
handle rather than routing it. `audit:switches` confirms: "no import reaches
around a switch". **The deploy hazard survived the fix**, because it was never
about the bypass — the table read is still `products.bullion` and production
still has no `products` schema. Verified 2026-08-29.

When that day comes: `pg_dump` first, then the migrations, then the backfills,
then `verify:parity` and `compare:databases`, then merge. Not before, and not
by an agent.

### The safety net is being removed on purpose, and that makes the order above absolute

**`exchange` MAY STOP RECEIVING WRITES** (Jacob, 2026-08-29, ruling 36: *"Yes
exchange can stop receiving those writes."*). The one-way door is open. It is
one decision rather than fourteen because the per-feature switches that would
have gated them individually were deleted as each feature's reads pivoted
(D146), so there is no per-feature ceremony left to perform.

**WHAT THAT COSTS, AND IT IS THE REASON THE SEQUENCE ABOVE STOPPED BEING
ADVICE.** With dual-writes in place, deploying this branch early was
*embarrassing*: customers were served the January snapshot while `exchange`
quietly kept the real rows, and the fix was a backfill. Without them, deploying
early means **new writes land in schemas that DO NOT EXIST** — production is
missing eight of the eighteen — so the write path raises **42P01 and no
`exchange` row is written either.** The order is lost rather than misplaced.
There is no undo, and this project has exactly one rule that outranks the
others.

**So `pg_dump` → migrate → backfill → verify → merge is not a checklist to work
through in a convenient order. It is the only sequence in which nothing is
lost.** Every step before the merge exists to make the merge survivable, and
each one is the user's to run.

### The pivot is IN PROGRESS, not done — read `docs/waves/write-pivot.md`

The covenant ledger has been taken and it is the important artefact: once
`exchange` stops being written, `verify:parity` compares two frozen tables and
its green stops meaning anything, so **the evidence could only ever be captured
before the switch**. That record — 15 pairs, 10 byte-identical, `only_in_target`
zero on all fifteen, and every one of the five exceptions measured rather than
cited — is in the lane file. Do not expect to be able to re-derive it.

**Three writes to `exchange` are NOT dual writes, and ruling 36 does not reach
them.** Each has no mirror because it has no destination:

- **`exchange.payouts`** — its successor `payments.details` deliberately stores
  no routing or account number (encryption at rest is outstanding). **Its order
  link is now BUILT**: the successor walked `order -> payments.intents ->
  details`, and an intent is money coming IN while a payout is money going OUT,
  so that join resolved for **0 of 16** dev payouts and neither statement raised
  on the empty update. Migrations 099/100 put the link on the order side
  (`orders.transactions.payout_details_id`), where the fee it is charged for
  already lives — 16/16 on dev, justified against production's 62 payouts whose
  `max(count) GROUP BY order_id` is 1. **No bank details moved**; routing and
  account numbers stay in `exchange.payouts` and nowhere else.
- **`exchange.users`** — **THE AUTH CUTOVER HAPPENED** (2026-09-01, Jacob's
  call, migration 107 + `features/auth/client.ts`). better-auth writes
  `auth.users` / `auth.sessions` / `auth.account` / `auth.verification` now.
  The row has two owners split by COLUMN, each mirrored by a depth-guarded
  trigger that cannot loop: identity (email, name, role, ban state, stripe
  customer) flows `auth -> exchange`, so every feature joining
  `exchange.users` stays fresh; `dorado_funds` flows `exchange -> auth`
  (features/users still owns the credit write), so the session object the
  frontend reads shows live balance. 056's one-way mirror — the one that
  silently reverted a $1000 credit written auth-side — is gone, and the same
  experiment now passes in both directions: funds set exchange-side propagate,
  and an auth-side row touch no longer reverts them. Two January ghost
  accounts on the auth side (one sharing Jacob's email under a different id,
  with a January-era password that would have become loginable) were removed
  in 107; sessions/credentials were reconciled from exchange the same day.
  Sessions and credentials now land only in `auth.*` — the exchange copies
  are frozen (ruling 36; a stale session is a re-login, not lost data).
  The `features/users/` funds write is UNCHANGED and still the live one.
  better-auth itself is PINNED EXACT at 1.6.9 (with `@better-auth/core` and
  `utils` held by root overrides): 1.7 cannot resolve the dotted schema
  `modelName` this whole arrangement stands on, and the pin's commit says so.
- **`purgeCancelled`** — a DELETE, behind a live admin button, that today
  destroys the `exchange` copy of cancelled orders while leaving the
  `orders.orders` rows the admin is actually looking at. A native port needs a
  six-table cascade, a `direction = 'purchase'` predicate that the exchange
  statement got for free from its table name, and a prior decision about whether
  the button should exist at all.

**Consequence for `api/legacy/`**: its README promises that *"promotion deletes
one directory"*, and two of its residents are sole implementations of live
writes — which its own entry criteria disqualify (*"a module that is still the
only implementation of a read or a write is not legacy yet, whatever it is
named"*). They were filed by feature name rather than by that test. **The
directory cannot be deleted in one move until they leave it.**

## Not all data is equally precious

The covenant is about **irreplaceable** rows, and treating every table as
irreplaceable made a wave stop dead on one that is not (Jacob, 2026-08-29):

- **`checkout.*` is device-sync, not a ledger.** A cart exists so a customer
  sees the same basket on their phone as on their laptop. Empty is fine, losing
  it is fine — *"we'd store checkout fully locally otherwise"*. What matters is
  that it **works**, not that it is preserved. `checkout.checkouts` and
  `checkout.items` holding zero rows is not a finding.
- **`exchange.scrap`, orders, items, payouts and the transaction ledger ARE
  irreplaceable.** A declared parcel, an order, a payout record: there is no
  second copy and no way to recreate one. 23 production `exchange.scrap` rows
  across 12 customers exist nowhere else. That is what the covenant is for.

So before invoking the covenant, ask which kind of table it is. Verify either
way; refuse to delete only when the rows cannot be recreated.

**Checkout is not "done" and will be overhauled.** The bar for now is that the
current version works against the new API and database — not that it is right.

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
api/                 @dorado/api        Express, ESM, TypeScript (Node runs .ts natively; the only .js left is the death-row *_SOURCE/dual-write halves)
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
6. **The WRITE half was a separate, later decision, and it has now been made.**
   Deleting a dual-write is a ONE-WAY DOOR: `exchange` stops receiving that
   feature's writes and flipping back loses everything written in between.
   **Ruling 36 (2026-08-29) opened that door** — one decision for all of them,
   because the per-feature switches that would have gated them individually no
   longer exist (D146). What that does NOT authorise is dropping anything:
   `exchange` keeps every table and every row it has. See the deploy section
   above for what the removal costs, and `docs/waves/write-pivot.md` for the
   ledger and the three writes ruling 36 does not reach.

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

**TWO `*_SOURCE` SWITCHES SURVIVE, NOT TWENTY-ONE.** `audit:switches` reports
`PAYMENTS_SOURCE` and `CHECKOUT_SOURCE`, both still defaulting to `exchange`.
This paragraph said twenty-one until 2026-08-29 and had been wrong for several
waves: as each feature's reads pivoted, its switch was deleted along with the
`repo.js` that read it, so the count fell without anyone updating the sentence
that named it. The retired ones are not promoted — they no longer exist, because
the feature reads its own schema unconditionally now.

**That makes the two survivors the whole of the remaining promotion decision,**
and it is still the user's call and still a one-way door: once `exchange` stops
receiving writes, flipping back loses everything written in between.

**A switch is not the only thing that can reach a new schema.** The instance
that taught this — `features/quotes/service.ts` importing
`#features/checkout/repo.next.ts` directly, around the `repo.js` that
`CHECKOUT_SOURCE` selects — **is closed** (D147: the read moved to
`features/products/service.ts` and the handle was un-exported, so there is no
door to reach through). `audit:switches` now scans for the shape and reports
"no import reaches around a switch". The habit stays: grep for direct
`repo.next` imports before trusting a switch to describe what a feature reads.
**What did NOT go away is the 42P01** — the read is still
`SELECT id FROM products.bullion`, on the endpoints that price every
customer-visible number, and production has no `products` schema. Closing a
bypass changed who calls the query, not which table it names.

**Two things were never a `*_SOURCE` switch.** `fulfillments` (methods,
pickups, directs) is capability `exchange` never recorded — there is no source
to read from, so a switch would have one state. `auth` was the atomic cutover
with no reversible middle, and it was TAKEN on 2026-09-01: better-auth writes
`auth.*` through its own pool now, with the column-partitioned user mirror
described in the write-pivot section keeping `exchange.users` fresh.

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

There is ALSO a Playwright e2e harness — nineteen specs under
`pnpm --filter @dorado/frontend e2e`, driving a real browser against a live
API. Coverage now spans the customer checkout journeys (bullion AND scrap to
the stepper; the buy side to its priced surface — both stop short of placing
an order), address CRUD through the drawer, and the admin area including real
MUTATIONS: `seed:e2e:order` mints a disposable purchase order as pure rows
(no FedEx call — the real create endpoint always buys a label, which is why
the seed exists), the drawer-work spec walks it through its lifecycle and
cancels it, and the creates spec runs full create->verify->delete cycles for
leads and carriers. The Google Places autocomplete lives in a `@maps`-tagged
spec that the default run EXCLUDES (`--grep-invert @maps` — every keystroke
in it is billed); `pnpm e2e:maps` runs it deliberately. E2e specs are
excluded from vitest twice over and do not run in `pnpm check`.

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
`shared/db/tests/transaction-side-effects.test.ts` fails the build if one comes back.

**Types come from generated contracts**, never hand-written. After any schema
change, regenerate — see the `verify-changes` skill.

**`NUMERIC` and `BIGINT` parsers are registered in `api/db.ts`**, next to the
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
  and production holds **10 products at .9999 and 6 at .9995** — both of which
  round UP in a 3-decimal column, because Postgres rounds half away from zero.
  **Measured 2026-08-29 (D200), and two things this entry used to say are
  corrected.** The scrap column's commonest value is **not** 1.000: `purity` is
  commonest at 0.925 (14 rows, sterling), then 0.400, 0.563, 0.900;
  `purity_actual` is 47 NULL, then 0.563, then 1.000 at **8 rows**. Scrap
  purities are karat-based and three decimals is the RIGHT scale for scrap — the
  defect is bullion purities landing in a scrap-shaped column. And the harm runs
  the other way: `purity_actual` does multiply into `content_actual`, but the
  rounding goes **UP**, so the business pays out for more fine metal than it
  received (~0.05%, about $5 on a $10,000 payout, on 8 rows) rather than
  shorting the customer. The fix is two non-destructive widening `ALTER`s, ready
  and unapplied. D61, D200.

- `audit:plaintext-secrets` — **every column in the database holding a bank
  number in the clear**, asked of `information_schema` by NAME pattern rather
  than from a hand-listed set of locations, so a new table inherits the check
  for free. Written because the exposure had been described in three places with
  three different numbers and nothing watched the columns: the count said 14 in
  one sentence and 10-ACH-plus-8-WIRE in the next, and the real answer is 7 and
  7. **It counts, and never selects** — no value enters the process, so none can
  reach a log, a crash dump or an error message. Reports rows AND distinct
  customers; `--prod` runs it read-only against production. Carries a floor: it
  asserts it can still see `exchange.payouts`'s two columns and calls a scan
  that cannot "broken" rather than "clean", because a scan matching nothing
  looks exactly like a database with no secrets in it. **Exits non-zero while
  any plaintext remains, by design**, like `audit:payments` and
  `audit:enum-domains`, and is therefore **not** in `pnpm check` — it goes green
  the day the clearing migration runs, which is Jacob's. Today: 4 columns,
  24 rows, 2 tables, 0 on dev.

- `audit:silent-mutations` — **every UPDATE or DELETE whose caller cannot tell
  it changed nothing.** Postgres does not raise on a zero-row UPDATE, so a
  `WHERE` that has quietly stopped resolving succeeds forever and the only
  symptom is data that does not change — which is how D168's two payout
  statements walked a join that resolved for zero of sixteen rows while every
  test passed. Matters more under ruling 36: most of these calls still have an
  `exchange` half doing the real work, and when that goes the silent half is the
  only half. Resolves each call's namespace through the calling file's own
  `import`, **not by function name** — the first version matched names, and
  `remove`/`update`/`create` exist in a dozen repos each, so it reported 54
  findings mostly attributed to the wrong feature (56 → 24 once fixed). Only
  statements that begin `UPDATE`/`DELETE`, only results that are discarded.
  Report-only. Today: 23 discarded, 1 unobservable — and the unobservable one
  (`tax.accrue`) is correct by design and wants an ACCEPTED map.

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
  Structured logging (`shared/logging/`, pino) enforces this shape-first: the
  request line is method/path/status/duration only, bodies never reach a log,
  and `routing_number`/`account_number` are in the redact list. `LOG_LEVEL`
  drives it; tests run silent.
- **Never change a wire shape** during a schema migration. The frontend is
  coupled to the current API surface; changing it is separate, deliberate work.
- **Never add `NOT NULL` from dev row counts.** Dev holds tens of rows. Use the
  production audit — `pnpm --filter @dorado/api audit:nullability`.
- **Verify before dropping.** `order_metals.percent_change` and `scrap.gem_id`
  are 100% NULL but still referenced by live code.
- `master` auto-deploys. There is no staging.

## Where things stand (2026-09-01, after the overnight majors and the auth cutover)

The 2026-08-28 snapshot this section used to hold (the conversion push, the
D87 series) is DONE and committed; FOLLOWUPS.md D77-D88 and both "Jacob's
rulings" sections remain the standing design law: statuses are pure
customer-facing labels driving no logic; offers are fully dead; customers
have zero post-placement order options; one endpoint per resource, owned by
the feature that owns the table; shared UI components lift as surfaces are
touched; admin order drawers are interim UI.

Since then, in order:

- **The frontend has real e2e coverage** (see Tests) including admin
  mutations on seeded disposable orders, and the unit lanes pin the carts'
  money behaviour. Coverage measures against an honest denominator.
- **The API is TypeScript end to end** except the death-row `*_SOURCE`
  halves, runs structured logging (pino, redaction-first), and every request
  logs one line.
- **The dependency majors landed overnight 8/31->9/1**: express 5, zod 4,
  Next 16 + Sentry 10, TypeScript 7 (typechecks fell from minutes to
  seconds), vitest 4, plus dotenv/chalk/node-cron/nodemailer/puppeteer.
  Stripe 18->22 is DEFERRED to UAT deliberately. better-auth is pinned exact
  at 1.6.9 - 1.7 broke every sign-in by mishandling dotted modelNames, found
  by e2e, root-caused by lockfile archaeology (the ^1.4.9 range had floated
  to 1.6.9 months ago; the manifest lied).
- **The auth cutover happened** (2026-09-01, Jacob's call): better-auth
  writes `auth.*`; the column-partitioned user mirror keeps `exchange.users`
  fresh both ways. Migration 107 carries the mechanics and the rollback.
- **Next up: the UAT environment** - a prod-dump database, the full
  migration chain rehearsed there, then CI/CD with the tests. The memory
  file `uat-environment-plan` lists the assets and tripwires; the Stripe SDK
  majors and `USE_TEST_DB=1` both unblock there.

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

- **Bank details are unencrypted at rest. The count is FOURTEEN payouts, and
  this entry said both 14 and 18 for months.** Measured 2026-08-29 by
  `audit:plaintext-secrets`, which now asks the database rather than repeating
  the number: of **62** payouts, **14** carry routing AND account numbers —
  **7 ACH and 7 WIRE**, across **9 customers**. The old "10 ACH and 8 WIRE"
  counted every ACH and WIRE ROW (11 and 8), not the ones actually holding
  numbers; 4 ACH and 1 WIRE payout carry none. Dev has none at all, which is
  what made them look vestigial — they are not.
  **The exposure is DOUBLED, and that half is unchanged**: production's
  `payments.details` holds ten plaintext rows across eight customers, every one
  matching an `exchange.payouts` row on (user_id, account_holder). All 56 of
  production's `payments.details` rows are January residue — not one shares an id
  with an `exchange.payouts` row. Migration 071 was written to remove them and
  has never run there. **24 plaintext rows across two tables** is the whole
  exposure, and that total was always right even while its two halves were not.
  **`scripts/encrypt-payout-details.mjs` did not exist, and now it does** — as
  `scripts/encrypt-payout-details.ts` (the extension moved with D157's
  scripts-to-TypeScript conversion). Migration 104 adds the columns it writes,
  `shared/crypto/envelope.ts` is the AES-256-GCM cipher under it, and the two
  citations in 073 and `verify-backfill.mjs` now name the file that exists.
  **It has never been run against production, and running it is Jacob's**, in
  the `pg_dump` → migrate → backfill → verify sequence.
  **An earlier version of this paragraph said `verify-backfill.mjs` skips
  comparing those columns "on the strength of it", implying the verification has
  a hole. It does not** — the exclusion is justified by the BACKFILL not writing
  those columns at all, which is true whether or not the script exists, and
  comparing them would assert that a rebuild reproduces plaintext bank details.
  The exclusion is correct and stays.
  **What is still outstanding**: nothing has been encrypted yet. The columns
  exist, the cipher is tested, the script refuses to run without a key and
  refuses to call an empty run a success — but production still holds all 24
  rows in the clear, and the migration that CLEARS the plaintext is deliberately
  not written, because it is destructive to `exchange` and needs the
  `allow-destructive:` marker, a stated backup, and Jacob.
- **Auth is no longer blocked — it is CUT OVER** (2026-09-01, migration 107).
  See the `exchange.users` entry in the write-pivot section for the full
  mechanics. What remains auth-flavoured: better-auth is pinned exact at
  1.6.9 because 1.7 breaks on dotted schema modelNames, and the pin should
  only move with a deliberate re-test of sign-in. Payments was listed here as
  blocked and is not — it is a different model rather than a reshaping:
  062 had already reconciled the new schema to `exchange`, and 074 derives
  the rest from the Stripe export.
- **The Stripe SDK majors (18→22, plus the frontend pair) are deferred to the
  UAT environment on purpose** — four majors of pinned-API-version drift on
  the money path get test-mode traffic first, never an overnight merge. The
  best-practice pass already landed on 18: intent creation is idempotent and
  carries reconciliation metadata (type, user_id, session_id — the fields D25
  says a webhook never has).
- **`audit:test-leaks` is blind to the eighteen new schemas** — it
  fingerprints `exchange` tables only. The five 'Pending' husk orders that
  test runs once committed into `orders.orders` are the proof the gap is
  real; extending the fingerprint set is the fix.
- **Products have no delete endpoint** (`create_product`/`save_product`
  only), which blocks full e2e create coverage and means the catalogue can
  only ever grow. The admin-creates spec documents it from the outside.
- **A stale `.env` sits at the repo root** pointing at a database that no
  longer exists (`dorado_db`); `api/env.ts`'s own comment records the class
  of confusion it causes. Tooling must use `api/.env`; deleting the root file
  is Jacob's call.
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
