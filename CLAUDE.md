@AGENTS.md

- **Output Verbosity**: Minimize bash command output. Do not print boilerplate installation logs, standard build outputs, or multi-line terminal outputs unless they contain a failing error.
- **Command execution**: Run commands silently using flags like `-q` or redirection (`> /dev/null`) where appropriate. 
- **Explanations**: Give 1-2 sentence summaries of actions instead of lengthy step-by-step guides.

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
closed** — D147 moved the read to its owner, `features/products/service.ts`
`findProductIdByName`, and un-exported the handle rather than routing it.
**The deploy hazard survived the fix**, because it was never about the bypass
— the table read is still `products.bullion` and production still has no
`products` schema. Verified 2026-08-29.

When that day comes, the sequence is **`pg_dump` -> RESET -> migrate -> verify
-> seal -> merge**, and the RESET step is new: **ruling 82** (Jacob,
2026-09-06, *"Drop and rebuild seems to make more sense. As long as it's not
dropped exchange"*) drops production's abandoned January schemas after the
dump, so genesis and the backfills rebuild them from `exchange` the way dev was
built. `pnpm --filter @dorado/api migrate:reset-january` is that step: its drop
list is `pg_namespace` minus a hard-coded protected set, `exchange` is asserted
out of it three times, it refuses without `--database`, `--url` and a `--dump`
file that exists and is non-empty, it prints every doomed table's row count and
newest timestamp before it will do anything, and it is dry until `--commit`.
Rehearsed end to end on a production-shaped copy 2026-09-06 with **zero
aborts** - `docs/waves/production-chain.md` carries the measured sequence and
the runbook. Not before, and not by an agent.

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

**So `pg_dump` → reset → migrate → verify → seal → merge is not a checklist to
work through in a convenient order. It is the only sequence in which nothing is
lost.** Every step before the merge exists to make the merge survivable, and
each one is the user's to run. The separate "backfill" step is gone as of
ruling 82: `-- baseline: 002-049` became `002-133` and the runner stamps only
PURE DDL, so every backfill runs inside `migrate` in its own place in the order
instead of being stamped and then replayed by hand.

### The pivot is DONE — D212 executed ruling 36 (2026-09-02)

Jacob: *"I want to get rid of ALL the legacy code. Remove fucking all of it."*
Executed: `api/legacy/` is deleted, every `repo.exchange`/`repo.dual` pair is
deleted, `CHECKOUT_SOURCE` and `PAYMENTS_SOURCE` are gone (checkout and
payments run their promoted native repos as plain `repo.ts`), the orders dual
layer and its mirror are gone, and **`exchange` receives no order, payment,
cart, product, address, shipping, lead, review or media writes any more.**
The covenant is unchanged where it matters: every `exchange` TABLE and ROW
stays, frozen; only code died.

The covenant ledger was taken BEFORE the switch, because once `exchange`
stopped being written `verify:parity` compares two frozen tables and its green
stops meaning anything. That record — 15 pairs, 10 byte-identical,
`only_in_target` zero on all fifteen, every exception measured — is in
`docs/waves/write-pivot.md`. Do not expect to re-derive it.

**NOTHING WRITES `exchange` ANY MORE — NOT CODE, NOT A TRIGGER (D214
2026-09-03, finished by migration 133 on 2026-09-06).** The list below was
three live writes; the last of them went in D214. What was left after that was
two mirror TRIGGERS feeding `exchange` from `auth.*` so that features joining
`exchange.users` kept seeing fresh identity, and **migration 133 RETIRED both**
(Jacob: "Yes migrate and retire") — `mirror_identity_to_exchange_insert` /
`_update` on `auth.users` and `mirror_sessions_to_exchange` on `auth.sessions`,
with their two functions. It was safe because nothing reads them: grepped
across `api/` excluding migrations, tests, `scripts/lib/feature-map.ts` and the
test-db preflight, `exchange.users` and `exchange.session` appear in ZERO
application files (the only hits were tooling, repointed at `auth.users` in the
same pass). So no statement in `api/` names an exchange table in an INSERT,
UPDATE or DELETE, and no trigger writes one either. Every exchange row still
stands, frozen and readable; identity and sessions live only in `auth.*`.

- **`exchange.users.dorado_funds` IS FROZEN.** The customer credit balance
  moved to `auth.users.dorado_funds` — the column 107 was already mirroring —
  and migration **118** retired the `exchange -> auth` funds mirror so the two
  directions cannot fight. `features/users` writes `auth.users` now, with a
  `payments.ledger` row per movement (the admin edit was the one way a balance
  could move with nothing recording why), under the same `FOR UPDATE` read and
  in one transaction. 118 also SPLIT the identity mirror's trigger into an
  INSERT half and an `AFTER UPDATE OF <identity columns>` half, because a
  balance write is now an update of `auth.users` and the old trigger would have
  written `exchange.users` through the back door on every one. **Both halves
  are GONE as of 133**, so the split no longer protects anything and is history.
  The exchange column keeps the value it held and is readable forever; it simply
  stops changing, which is ruling 36.
- **`exchange.users` identity columns** — **THE AUTH CUTOVER HAPPENED**
  (2026-09-01, Jacob's call, migration 107 + `features/auth/client.ts`).
  better-auth writes
  `auth.users` / `auth.sessions` / `auth.account` / `auth.verification` now.
  The row had two owners split by COLUMN, each mirrored by a depth-guarded
  trigger that cannot loop: identity (email, name, role, ban state, stripe
  customer) flowed `auth -> exchange`, so every feature joining
  `exchange.users` stayed fresh. **That mirror was RETIRED by migration 133
  (2026-09-06)** once the grep proved no application file reads
  `exchange.users` at all; `auth.users` is the only owner now.
  `dorado_funds` used to flow the other way,
  `exchange -> auth`; migration 118 retired that half and the balance is
  written auth-side directly, so the session object the frontend reads shows
  it without a mirror. 056's one-way mirror — the one that
  silently reverted a $1000 credit written auth-side — is gone, and the same
  experiment now passes in both directions: funds set exchange-side propagate,
  and an auth-side row touch no longer reverts them. Two January ghost
  accounts on the auth side (one sharing Jacob's email under a different id,
  with a January-era password that would have become loginable) were removed
  in 107; sessions/credentials were reconciled from exchange the same day.
  Sessions and credentials now land only in `auth.*`. **`mirror_sessions_to_exchange`
  (108) IS RETIRED — migration 133, 2026-09-06** — so a login no longer writes
  `exchange.session` at all. The rows it already holds stay; a stale session is
  a re-login, not lost data, which is why ruling 36 always allowed this.
  better-auth itself is PINNED EXACT at 1.6.9 (with `@better-auth/core` and
  `utils` held by root overrides): 1.7 cannot resolve the dotted schema
  `modelName` this whole arrangement stands on, and the pin's commit says so.
- **`exchange.payouts` HOLDS, and is no longer READ EITHER (D214).** New-flow
  payout accounts are SEALED into `payments.details` (AES-256-GCM envelopes,
  D210); the last-four reads left exchange in D213 (migration 114), and the
  FULL-NUMBER endpoint `GET /payouts/:id/details` followed them — it composes
  the native payout row and opens the envelopes through
  `payments/details`' `decryptFor`, which is the only place envelopes open.
  The 24 old plaintext rows stay in `exchange.payouts` untouched, the only copy
  of those bank numbers, and **that endpoint answers null for them until
  production runs 071 + 073 + `encrypt:payouts`, in that order.** The order
  matters and was measured read-only on 2026-09-03: `encrypt:payouts` joins
  `payments.details` to `exchange.payouts` ON id, 073 is what gives a
  backfilled details row its payout's id, and TODAY that join resolves **zero**
  of production's 62 payouts because all 56 of its `payments.details` rows are
  January residue sharing no id with a payout. Running the script before the
  backfill would seal nothing and report it. That is Jacob's, on the day of the
  `pg_dump` → reset → migrate → verify sequence (ruling 82).
- **The order NUMBER was still an exchange write until D213, and it did not
  look like one.** `features/orders/sql/create.sql` drew it with
  `nextval('exchange.purchase_orders_order_number_seq')` — and `nextval`
  MUTATES. Every order created after the Great Purge reached into `exchange`
  and advanced a counter there. No sweep caught it because it is a function
  call inside a VALUES list, not an INSERT/UPDATE/DELETE. 079 had built
  `orders.purchase_number_seq` / `orders.sale_number_seq` for this moment;
  115 re-seeded them (dev's native counter sat at 2278 while eighteen orders
  already held higher numbers, so switching without the re-seed would have
  raised 23505 on the very next order) and `create.sql` now draws natively.
  **If you add a table that needs a number, look for `nextval` before
  believing a sweep that only greps for write statements.**

### THE ONE REMAINING EXCHANGE READ ON A LIVE PATH: `features/places` addresses

**`features/orders/read.service.ts` composes every order's address from
`exchange.addresses`, and it CANNOT simply be repointed at `places.addresses`
(verified 2026-09-02).** This is not an oversight left over from the purge and
it is not a read anyone forgot — it is blocked on data that has no native home
yet, and repointing it blindly is a live-path regression:

- `compose.ts`'s `snapshotAddress` maps `row.name` → **`recipient_name`**, which
  is **who receives the parcel** and is what `cancelOrder` hands FedEx as the
  return label's `personName`.
- **`places.addresses` has NO `name` column.** Its columns are id, line_1,
  line_2, city, state, country, zip, country_code, phone_number, created_at,
  updated_at, is_valid, is_residential.
- **`places.user_addresses` has `label`, not `name`** — id, address_id, user_id,
  label, default_shipping, default_billing — and `label` is a book nickname
  ("Home"), not a recipient.
- Coverage is NOT the problem and measuring it will mislead you: all 51
  `orders.addresses.source_address_id` values resolve in **both**
  `exchange.addresses` and `places.addresses`. The ids match; the COLUMN does
  not exist. A repoint therefore passes every parity and coverage check and
  silently blanks `recipient_name` on every order.

**So the fix is a decision about where a recipient name lives, and it belongs to
`features/places/addresses` as its own pivot — not to a cleanup pass.**
`compose.ts`'s header already says the book "is still exchange.addresses until
addresses' own reads pivot".

**`purgeCancelled` is GONE from the UI** (button removed 2026-09-01) and its
exchange DELETE went with the purge; a native cancelled-orders purge (a
six-table cascade) is future work, and the disposable e2e orders accumulate as
fuel for it.

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
api/                 @dorado/api        Express, ESM, TypeScript (Node runs .ts natively)
  db/<schema>/         repos + sql, laid out BY POSTGRES SCHEMA
  catalog/ checkout/ crm/ identity/ logistics/ media/ orders/ payments/ pricing/
                       the nine domains: service, rules, routes, controller, tests together
  domains.ts           the service barrel (`#domains`)
  shared/ providers/ scripts/ migrations/ types/
frontend/            @dorado/frontend   Next.js, TypeScript, strict
packages/contracts/  @dorado/contracts  zod schemas, imported by api only
```

The frontend imports `@dorado/contracts` as its ONLY source of table-derived
shapes — types and, since the zod/v4 unification, the runtime schema objects
themselves (Jacob's single-source ruling, executed 2026-08-28). Frontend
files keep local names for UI concerns and alias contract imports as
`<Name>Contract` on collision.

`api` uses subpath imports — `#db/*`, `#shared/*`, `#providers/*`, `#domains`
and one per domain (`#catalog/*`, `#checkout/*`, `#crm/*`, `#identity/*`,
`#logistics/*`, `#media/*`, `#orders/*`, `#payments/*`, `#pricing/*`). Never a
relative path that crosses between two of those roots.

**Ruling 77 (executed 2026-09-06): `api/domain/` and `api/transport/` are
gone.** Jacob: *"while the DB should be by schema, I don't think our feature
code should be. Let's also reunify transport/domain under one folder again."*
A service, its rules, its routes and its controller now sit in one folder, and
the nine domains above are declared in exactly one place — `package.json`
`imports`. `scripts/lib/layout.ts` reads that map: `domainDirs(root)` returns
the wildcard roots that are not db/shared/providers, and `isTransportFile(rel)`
is the role the `transport/` folder used to encode (`routes.ts`,
`*.routes.ts`, `controller.ts`). Every lint, `vitest.config.ts`'s aliases and
its coverage keys derive from it, so a new domain is one `imports` line and
nothing is hand-listed. `db/<schema>` stays laid out by Postgres schema. No URL
moved: the route census is identical before and after (136 routes, 70
requireAdmin / 55 requireUser / 10 unguarded). See `docs/waves/domains.md`.

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

## `api/legacy/` is DELETED (D212, 2026-09-02)

Jacob: *"I want to get rid of ALL the legacy code. Remove fucking all of it."*
The directory, its README, the `#legacy/*` import root, `lint:legacy-boundary`
and every dual-write mirror are gone; git has them. What the deletion does NOT
touch: `exchange` TABLES and ROWS (they never move and never drop — they are
what the eventual production backfill reads from), and reads against
`exchange` data that exists nowhere else (`features/payouts` reading the old
payout rows, `features/users` writing `dorado_funds`).

The delete-as-we-go checklist that governed the migration is history now; the
one live rule it leaves behind: **"the tests pass" is not evidence that data
migrated** — a test reads its own writes either way, and completion was always
about DATA.

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

**NO `*_SOURCE` SWITCH SURVIVES (D212, 2026-09-02).** `CHECKOUT_SOURCE` and
`PAYMENTS_SOURCE` — the last two — were flipped and deleted with the purge:
each feature's `repo.next.ts` was promoted to plain `repo.ts` and the
`repo.js`/`repo.dual.js`/`repo.exchange.js` trios died. Every feature reads
and writes its own schema unconditionally. `audit:switches` and `diff` are
deleted with their subject.

**What did NOT go away is the 42P01 deploy hazard** — reads like
`SELECT id FROM products.bullion` sit on the endpoints that price every
customer-visible number, and production has no `products` schema. The purge
made the deploy ordering MORE absolute, not less: there is no exchange
fallback anywhere.

**The auth cutover was TAKEN on 2026-09-01**: better-auth writes `auth.*`
through its own pool, with the column-partitioned user mirror described in
the write-pivot section keeping `exchange.users` fresh.

**The wire axis is RETIRED (2026-08-28)** and `shared/wire/` is deleted
(D212): the frontend reads every response shape from `@dorado/contracts`, and
wire SHAPES never move during a schema migration — the legacy spellings some
tables still alias to (`supports_pickup` and friends) are the wire's, kept on
purpose. The frontend computes NO money: every customer-visible number comes
from the `/quotes/*` endpoints (D81–D84).

**`PROMOTION.md` is now a historical record** — the promotions it describes
have all been executed; what it still holds that matters is the production
sequencing context.

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
rolled back, and need `TZ=UTC` — `pnpm --filter @dorado/api test`. **The
runner is vitest 4 now (2026-09-03, lane 3)**: the same suite and the same
pinned-transaction harness (`pinned-pool.ts`, `locks.ts`, `session.ts`)
converted mechanically from `node --test` (`before`→`beforeAll`,
`after`→`afterAll`, `node:assert/strict` untouched), 1017 tests across 165
files in ~17s (five consecutive runs, 0 fail) against the old runner's
~20s — forks pool with `isolate: true` reusing worker processes instead of
spawning one per file, `maxWorkers: 12` because the naive default (all three
projects racing at once) reproduced real lock-contention failures a single
project's run never hit. `test` is split by what a file actually imports, not
by directory
(`scripts/lib/test-layers.ts`, derived from the tree every run):
`test:unit` (no database, under 2s), `test:db` (repo + service), `test:http`
(supertest), and plain `test` runs all three. **A LOCAL Postgres is the
default** (2026-09-03): `test` runs a preflight that checks a local cluster on
127.0.0.1 is up, provisioned, and fully migrated — auto-applying any pending
migration there and only there — before running the suite against it.
**Each worktree now gets its own database, not the one `test` every lane used
to share** — the preflight derives `test_<branch>` from the current git
branch (the main checkout and the `api-hardening` branch itself keep plain
`test`), creating it from `test` as a template on first use, so a migration
written in one lane's worktree can no longer change the schema under every
other lane's gate at once (the lesson FOLLOWUPS D214 item 9 appended
2026-09-03). `pnpm --filter @dorado/api test:on-dev` runs the suite against
the remote dev database instead — no preflight, no per-branch database. See
`docs/waves/local-postgres.md` and `docs/waves/test-suite-redesign.md`. They
live with their feature, grouped under `<layer>/<feature>/tests/` (ruling
31 — `db/`, `domain/`, `transport/`, `shared/`, `scripts/`, `providers/` now
that `features/` has split), and a test whose subject moves moves with it in
the same pass.

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

**The database stamps audit columns; code never writes them** (migration 116,
2026-09-02). `authMiddleware` puts the session user in an AsyncLocalStorage,
`withTransaction` issues `set_config('app.actor_id', $1, true)` after BEGIN,
and the `audit_stamp` trigger fills created/updated at/by on every audited
table. So: every write goes through `withTransaction` (a write outside it
stamps nothing), repos are `create(row, tx?)` / `update(id, patch, tx?)`
with no actor argument, and `shared/db/patch.ts` `buildUpdate` is the one
patch builder (keys present are set, explicit null clears, unknown or audit
keys throw). Genesis carries no triggers on purpose: 116 runs after the
backfills.

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

`pnpm check` before committing — now `scripts/check.mjs` (phase5-fast-gate.md
task 3), which runs the same 27 members grouped by dependency instead of one
27-step serial chain: contracts build first (everything else imports its
built dist), then five groups concurrently - API lints, API typecheck+test,
components, frontend, and the dev-database audits (serial inside that one
group only, by design - D196 recorded a livelock from concurrent dev
queries). A first attempt let components' and frontend's own steps (each
already internally multi-process - vitest, next build) race each other on
TOP of the groups racing, oversubscribing the 24 cores badly enough to fail a
component test on a resource-contention timeout (not a real bug) and run
SLOWER than serial (464s). Fixed by making those two groups serial inside
themselves; a clean rerun then measured 231s, PASS - down from the ~382s
serial chain, now kept as `check:serial` for one release as a cross-check.
Background it rather than letting a timeout kill it.

**`pnpm check:fast` is a faster gate for iteration**: `scripts/check.mjs
--fast` - contracts build, then the API's static lints and its
typecheck+test, concurrently. Measured 21.31s wall clock. It omits
everything that needs the DEV database (`verify:fresh`, `validate`,
`verify:genesis`, `audit:coverage`, `audit:indexes`, `audit:query-paths`,
`audit:constraints`, `audit:non-finite`, `audit:nullability`, `validate:wire`)
and everything frontend/components, typecheck and build included. `pnpm
check` runs every member and is what actually gates a commit;
`pnpm check:serial` is the same 27 members as one literal chain, kept as a
cross-check for one release.

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
- `validate:wire` — real responses parsed through the wire contracts. (The
  `bothWays` two-implementation machinery retired with the switches, D212 -
  one implementation per feature now.) Contracts describe the wire, so
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
  database allows to be absent.** The frontend keeps its own zod schemas,
  and three of them are `.parse()`d on the checkout
  path, so one can reject the API's own data. 77 fields compared against
  production, 31 stricter, **17 in schemas parsed at runtime** — none live, and
  measured: 247 production rows, not one null. A mismatch is not automatically
  a defect and the report says so; a form schema *should* be stricter than its
  column. Two guards earn their keep: it prints how many of a schema's fields
  are really columns of the mapped table (`pickupSchema` matched 0 of 6 and had
  been reporting clean), and dropping `serviceSchema` killed a false alarm
  where a FedEx rate quote shared only the word `code` with
  `carrier_services` — the third shared-name false finding on this project.
- `audit:indexes` — **every access path `exchange` indexes that the new schema
  does not.** `audit:constraints` reads `pg_index` but filters on `indisunique`,
  so the plain indexes had never been looked at at all. Uniqueness is a
  correctness guard and something eventually raises 23505 when it goes; a plain
  index going produces no error at all — same rows, same order, sequential scan.
  Nothing downstream sees it either: `verify:parity` compares rows,
  `validate:wire` compares shapes, and both
  pass against a table with no indexes whatsoever. The only symptom is latency,
  and dev holds tens of rows where a seq scan is genuinely the faster plan — so
  the symptom first appears as production row counts arriving at a schema nobody
  measured. Asks the access-path question, not the uniqueness one: does any
  target index **lead** with the column the source index leads with. Found
  `media.images(user_id, created_at)` — the index behind "list my images" — and
  `tax.sales_tax(state)`, which both live sales-tax queries key on. Three more
  are named in `ACCEPTED` with the query that makes each a non-issue, pinned from
  both sides so a new gap fails and a fixed one forces the entry out.
- `audit:query-paths` — **the other direction of the index question.**
  `audit:indexes` is source-driven: it walks `exchange`'s indexes and asks
  whether each survived. It is blind by construction to a lookup `exchange`
  never had — a `WHERE` written fresh in a native repo has no source index to
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

## Where things stand (2026-09-02, after the Great Purge)

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
- **THE GREAT PURGE LANDED (D212, 2026-09-02)**: all legacy code is gone -
  `api/legacy/`, every `repo.js`/`repo.dual`/`repo.exchange` trio, the last
  two `*_SOURCE` switches (checkout and payments promoted to native
  `repo.ts`), the orders dual layer and mirror, `features/scrap` (the scrap
  IS the line), `shared/wire/`, `paid.service.ts` and every one-column
  wrapper (one generic `update(id, patch)` per table now - Jacob's
  single-CRUD ruling), plus `audit:switches`, `diff`,
  `audit:wire-readiness`, `lint:legacy-boundary` and the dual-era tests.
  The sweeps read `payments.intents`; the seed drives the native create
  flow. 896/896 API tests green. `exchange` keeps every table and row;
  its one live write was `features/users`' `dorado_funds`, and **D214
  (2026-09-03) moved that to `auth.users` too** — see the write-pivot
  section. No application statement writes `exchange` now.
- **THE MODEL REDESIGN WAS PARKED THE SAME EVENING IT WAS DESIGNED**
  (Jacob, 2026-09-02): *"Lets just keep it how it is. This shit is too
  complicated. The current system can be migrated again later on if
  needed. Our business rules aren't changing."* The current tables stay.
  `docs/model/` was deleted at his request; FOLLOWUPS D213 keeps the
  rulings as history. Do not resume the redesign unprompted.
- **Next up: the restructure** - `features/` splits into `db/` (repos +
  sql), `domain/` (services and their logic) and `transport/` (routes +
  controllers) - DONE and staged on `model-redesign` 2026-09-02, gate green;
  then the CRUD refactor (one generic update per table, no prop spreading,
  ids in from the client) on the CURRENT tables; then the UAT environment - a prod-dump database, the full
  migration chain rehearsed there, then CI/CD with the tests. The memory
  file `uat-environment-plan` lists the assets and tripwires; the Stripe SDK
  majors and `USE_TEST_DB=1` both unblock there.
- **THE FRONTEND INFORMS NOTHING, AND BREAKING IT IS FINE** (Jacob,
  2026-09-02, reaffirmed 2026-09-03: *"It's all gonna change as part of
  this branch anyway"*). No lane on this branch preserves a request or
  response shape; inputs are ids plus new data; each pass lists its shape
  changes for the one frontend pass at the end. Original ruling: *"Don't let the
  frontend inform our decision making on the api AT ALL."* The frontend
  updates to match the API, per surface, after the API is written; the API
  does not care what the frontend has or wants. The "never change a wire
  shape during a schema migration" rule was for the exchange->January move
  and does not apply to this redesign.

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
  the `pg_dump` → reset → migrate → verify sequence (ruling 82).
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
  **D214 RAISED THE STAKES AND NARROWED THE STEP.** No code reads that
  plaintext any more — `GET /payouts/:id/details` opens the sealed envelopes on
  `payments.details` instead — so on production those fourteen payouts will
  show a holder, a method and a last-four with **null bank numbers** until the
  script runs. And the script alone is not enough: it joins the two tables ON
  id, which **071 + 073 establish**, and neither has run there. Measured
  read-only 2026-09-03: the join matches **0 of 62** payouts today, so
  `encrypt:payouts` run first would seal nothing and say so (it refuses to call
  an empty run a success, which is exactly the guard that makes this safe to
  get wrong). The order is 071, 073, then `encrypt:payouts --commit`, then
  `--verify`. Dev was run through all three on 2026-09-03 and holds no bank
  numbers at all, so it sealed zero and `audit:plaintext-secrets` stays at 0
  there.
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
- **Products have no delete endpoint, AS DESIGNED** (Jacob, 2026-09-01:
  "As designed..."). The catalogue only grows on purpose; the admin-creates
  e2e spec asserts the dialog and deliberately never submits. Stop reporting
  this as a gap.
- **A stale `.env` sits at the repo root** pointing at a database that no
  longer exists (`dorado_db`); `api/env.ts`'s own comment records the class
  of confusion it causes. Tooling must use `api/.env`; deleting the root file
  is Jacob's call.
- **Production has no record of $126.48 it was paid.** Three Stripe intents were
  captured and the local intent rows record `amount_received` as null or 0
  while still saying `requires_payment_method`; two further charges have no row
  at all. Nothing is lost — Stripe has the money and Stripe is right — but the
  webhook that updates `exchange` is not reliably landing, and the visible
  symptom is a checkout that fails at the last step because the API offers back
  an intent Stripe will not confirm. `audit:payments` prints the list.
- **No production migration has been run, and no `pg_dump` taken.** The dump
  comes first.
- Docker images are unverified — no daemon in the dev environment.
