# UAT rehearsal — the production migration, run end to end on a local copy

2026-09-05, branch `uat-lane`, worktree `/home/jtj60/dorado-lanes/uat`.

The `pg_dump → migrate → backfill → verify → merge` sequence CLAUDE.md describes
was run against a local copy of production, to find out what production day
actually holds. Production itself was never written: the only thing that touched
`PROD_READONLY_DATABASE_URL` was `pg_dump` and `compare:databases`.

**The headline: the sequence as written does not work.** It leaves production's
order table unable to accept an insert, twenty-five columns on the wrong
timestamp type, seven tables foreign-keyed to a January snapshot, and the
product catalogue empty. Every one of those is fixable, and none of them is
visible from dev. The detail is below; the runbook at the end is the sequence as
it now stands.

Scratch databases left in place for inspection on the local cluster
(`127.0.0.1:5544`): **`uat`** (production, migrated) and **`uat_pristine`**
(production, untouched). No customer names, addresses or account numbers appear
in this document; counts only.

---

## 1. The dump

| # | command | exit |
|---|---|---|
| 1 | `pg_dump -Fc --no-owner --no-privileges $PROD_READONLY_DATABASE_URL` | **1** |
| 2 | `… --exclude-schema=core` | **1** |
| 3 | `… --exclude-schema=core --exclude-schema=auctions` | **1** |
| 4 | `… -T 'exchange.*_seq'` | **1** |
| 5 | `pg_dump -Fc --schema-only --exclude-schema=core --exclude-schema=auctions` | 0 |
| 6 | `pg_dump -Fc --data-only -t exchange.purchase_orders` | **1** |

```
pg_dump: error: query failed: ERROR:  permission denied for schema core
pg_dump: error: query failed: ERROR:  permission denied for schema auctions
pg_dump: error: query failed: ERROR:  permission denied for sequence auctions_number_seq
pg_dump: error: query failed: ERROR:  permission denied for sequence purchase_orders_order_number_seq
```

**F1 — the read-only role cannot dump production.** It has SELECT on tables but
not on schemas `core` and `auctions`, and not on any of the four sequences.
Schemas can be excluded; the sequences cannot, because they are owned by their
tables (`exchange.purchase_orders`, `exchange.sales_orders`,
`exchange.auctions`) and pg_dump dumps an owned sequence with its table
regardless of `-T`. Excluding them means excluding `exchange.purchase_orders`.
So there is **no flag combination that produces a data dump with this
credential**, and step 1 of the production sequence cannot be performed as
recorded. It needs the owner role (`dorado`) or a superuser.

Rehearsal source: `/home/jtj60/dorado-prod-20260825.dump`, a full custom-format
dump taken 2026-08-25 with pg_dump 16 from server 16.11 — 87 TABLE DATA entries,
4 SEQUENCE SET, 12 schemas. Its table list was checked against live production
(via `compare:databases`) and matches exactly, 87 for 87.

### Restore

```
createdb -h 127.0.0.1 -p 5544 uat
pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5544 -d uat <dump>   # exit 0, 0 errors
pnpm --filter @dorado/api compare:databases --source PROD_READONLY_DATABASE_URL --target DATABASE_URL
```

First run: **34 differences across 76 tables**. Second run, after
`ALTER DATABASE uat SET TimeZone='UTC'`: **17**.

**F2 — `compare:databases` reports false differences when the two servers differ
in `TimeZone`.** It fingerprints with `md5(string_agg(t::text, …))`, and
`t::text` renders `timestamptz` in the session time zone. Railway is UTC; a
local Debian/Ubuntu cluster is whatever the OS says (here `America/Chicago`).
**Seventeen of the thirty-four differences were the clock, not the data** — and
on production day that is a restore that looks half-broken and is not. The tool
should `SET TimeZone='UTC'` (and `DateStyle`) on both connections before
fingerprinting.

The 17 that remain are all explained:

- **11 unreadable** — `core.*` (9) and `auctions.*` (2), permission denied on the
  source. Same gap as F1.
- **3 sequences** report `source null` — the same permission gap; the script's
  own hint says so.
- **14 genuine drift** between 2026-08-25 and 2026-09-05: `leads` +5,
  `tracking_events` +5, `session` −10, `scrap` −1, `sell_cart_items` −1,
  `verification` −1, and content changes on `account`, `metals`, `order_metals`,
  `payouts`, `purchase_orders`, `purchase_order_items`, `refiner_metals`,
  `shipments`.

**The restore is proven whole**: zero tables missing, zero unexplained content
differences, `pg_restore` exit 0 with no recovered errors.

## 2. Starting state of `uat`

- **13 schemas**: `exchange`(38 tables), `core`(9), `orders`(6), `shipping`(6),
  `auth`(5), `payments`(5), `fulfillments`(5), `places`(4), `refiners`(3),
  `tax`(2), `checkout`(2), `auctions`(2), `public`(0). 87 tables.
- **Eight of the seventeen native schemas are absent**: `products`,
  `organizations`, `metals`, `spots`, `media`, `leads`, `rates`, `reviews`.
  (`auctions` is retired by 067, so the working list is seventeen, not
  eighteen — `scripts/lib/schemas.ts` is the authority.)
- **`exchange.schema_migrations` does not exist.** The ledger is empty: all 137
  migration files are pending, and `000_genesis_schema.sql` carries
  `-- baseline: 002-049`, so 48 of them are stamped without running.
- January residue: `orders.orders` 60, `orders.items` 80, `orders.offers` 50,
  `payments.{intents,attempts,settlements}` 70 each, `payments.details` 56,
  `fulfillments.fulfillments` 60, `shipping.shipments` 44, `shipping.tracking`
  427, `places.addresses` 118, `auth.users` 60, `auth.sessions` 186,
  `tax.sales_tax` 51, `checkout.*` 0, `core` 294 rows across 9 tables.

## 3. `migrate`

`pnpm --filter @dorado/api migrate` refuses any database but `dev`; every run
below used `MIGRATE_ALLOW_DB=uat`. Checksum drift on an already-applied file is
a **warning**, not an error, so editing a migration cannot break dev's ledger.

### Failure 1 — genesis, on the first run

```
applying 000_genesis_schema.sql ... FAILED
000_genesis_schema.sql rolled back:
  could not create unique index "attempts_provider_ref_key"
```

`payments.attempts` holds 70 January rows with 67 distinct `provider_ref` — one
value twice, one three times. Genesis line 3543 builds that index unique.

Probed with `ON_ERROR_ROLLBACK` inside a rolled-back transaction: **this is the
only statement in the whole 3,600-line file that fails.**

Resolution — **finding, not fix**. `071_remove_the_payments_residue.sql` deletes
exactly these rows (none shares an id with `exchange.payment_intents`), and
`103_uniqueness_survives_the_promotion.sql` then creates the same index under
the same name. So the chain already converges; genesis merely runs too early.
Genesis cannot be edited to guard the statement, because `verify:genesis`
requires the committed file to be **byte-identical** to a regeneration from dev,
and regenerating needs dev. The production-day step is therefore to run 071's
four DELETEs **before** starting the chain. Measured here:

```
DELETE 70  (payments.settlements)
DELETE 70  (payments.attempts)
DELETE 70  (payments.intents)
DELETE 56  (payments.details)      -- includes the 10 rows holding bank numbers
```

266 rows, all January residue, all in the new schemas; `exchange` untouched.
071 later re-runs and deletes nothing.

### Failures 2–6 — inside the chain

With genesis past, the chain applied 000, 001, the 48 baseline stamps and
050–131, failing five more times. Each was stamped in `uat` and the run
continued, to collect the whole list in one pass.

| migration | error (verbatim) | cause |
|---|---|---|
| `088_catch_the_new_schema_up_with_the_stale_server.sql` | `column b.sell_display does not exist` | 119 drops `products.bullion.sell_display`; genesis creates the post-131 shape |
| `090_paper_trail_for_documents_and_mail.sql` | `type "pdf_kind" already exists` | genesis already created the enum; 090's `CREATE TYPE` is unguarded |
| `092_the_lifecycle_loses_the_offer_statuses.sql` | `"purchase_order_accepted" is not an existing enum label` | genesis creates the post-092 enum; 092 removes labels that are already gone |
| `101_the_new_schema_refuses_what_exchange_refused.sql` | `constraint "items_purity_range" for relation "items" already exists` | genesis already created it |
| `102_the_not_nulls_that_promotion_would_drop.sql` | `column "quantity" of relation "bullion" does not exist` | 131 drops it; genesis is post-131 |
| `129_ids_are_the_databases.sql` | `ruling 72: 4 uuid primary key column(s) outside exchange/auth have no database default` | see F5 and F6 |

**F3 — genesis is the shape *after* migration 131, but 050–131 are written
against the shapes of their own day.** Any migration naming a column a later one
drops (`products.bullion.sell_display`, `.stock`, `.quantity`,
`orders.orders.pool_remediation`) aborts against a genesis-built database, and
any migration creating an object genesis already created aborts too. Five of the
six failures above are this. On dev none of it shows, because genesis never runs
there.

### 129's guard was right twice

The four offending columns were `core.images.id`, `core.metals.id`,
`orders.orders.id`, `orders.transactions.id`.

**F4 — `core` survives the entire chain.** `013_split_core_into_feature_schemas`
is the only migration that dissolves it, and it sits inside the `002-049`
baseline, so it is stamped and never runs. `core` then blocks `129` and makes
`verify:genesis` refuse outright (`NATIVE_SCHEMAS … does not list: core`).

Worse: **seven live tables in the new schemas are still foreign-keyed to
`core`**, and genesis never replaced those keys, because it checks
`ADD CONSTRAINT` by constraint **name** and January's names are the same names
dev uses — same name, wrong target:

```
orders.items.bullion_id      -> core.bullion          (not products.bullion)
orders.items.metal_id        -> core.metals           (not metals.metals)
orders.spots.metal_id        -> core.metals
refiners.items               -> core.bullion, core.metals
refiners.refiners            -> core.organizations
checkout.items               -> core.bullion, core.metals
places.locations             -> core.images, core.organizations
shipping.carriers            -> core.organizations
payments.methods.image_id    -> core.images
```

14 constraints. `core.bullion` holds 66 rows against `exchange.products`' 95, so
after migration an order item for any of the other 29 products would raise a
foreign-key violation. **No existing check sees this**: `verify:parity` compares
rows, `validate:wire` compares shapes, `audit:constraints` looks at uniqueness,
and `verify:genesis` cannot run at all while `core` exists.

Measured before dropping: every value that currently references `core` also
resolves in `exchange` — `core.bullion` 66/66 in `exchange.products`,
`core.metals` 4/4, `orders.items.bullion_id` 19/19,
`orders.items.metal_id` 76/76, `orders.spots.metal_id` 228/228, no image
references at all. So a repoint onto the backfilled tables resolves. `core` was
dropped here (`DROP SCHEMA core CASCADE`, 294 rows across 9 tables; its one
function, `convert_to_troy_oz`, already exists in `metals` via genesis).

**F5 — `orders.orders.id` and `orders.transactions.id` have no
`DEFAULT gen_random_uuid()` after migration.** Genesis's
`ALTER TABLE … ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()` is a
no-op when the column already exists, and on production it always does. Ruling
72 removed every `randomUUID()` from application code, so **production could not
create an order at all.** The test suite reproduces this 156 times (§6).

### The general form

With `core` gone, `verify:genesis` runs, and its committed-vs-regenerated check
reports the schema drift directly. **50 hunks, 19 tables**:

- **25 columns are `timestamp without time zone` where dev has `timestamptz`** —
  all 13 `auth.*` timestamps (session expiry, token expiry, ban expiry), the four
  `fulfillments.{directs,pickups}.{start,end}_time` pickup windows,
  `orders.orders.{created,updated}_at`, `orders.transactions.{created,updated}_at`,
  `places.addresses.{created,updated}_at`. `008_new_schema_timestamptz.sql` is
  what converts them, and it is inside the baseline.
- **20 columns lack `NOT NULL`** (including `orders.orders.number`).
- **18 columns lack their default** — `now()` ×18, `gen_random_uuid()` ×2,
  `false` ×3, `'1000000000000'::bigint` ×3, `10000`, `'All'::tax.sales_tax_product_type`.

**F6 — `-- baseline: 002-049` is correct for an empty database and wrong for
production.** It says "genesis creates the shape those 48 migrations produce, so
stamp them". That holds only where there is nothing to alter. Production already
holds ten of the schemas, genesis's DDL is `IF NOT EXISTS` throughout and so
cannot repair an existing table, and the 48 migrations that would have repaired
them are stamped instead of run. Everything in this section — F3, F4, F5, the
timestamps, the defaults, the nullability — is one bug wearing six faces.

## 4. The backfills

`verify:backfill` defines the backfill set as migrations matching
`backfill|seed` numbered above 028. Nine of them (029, 031, 034, 036, 038, 040,
042, 047, 049) are inside the baseline and were stamped, not run; the rest
(050–100) ran inside the chain — **before** the nine they depend on.

Run by hand afterwards:

| file | result |
|---|---|
| `029_genesis_backfill.sql` | **FAIL** `column "stock" of relation "bullion" does not exist` |
| `031_backfill_orders.sql` | ok |
| `034_backfill_orders_missing_columns.sql` | **FAIL** `column p.pool_remediation does not exist` (×2 statements) |
| `036_backfill_spots_columns.sql` | ok |
| `038_backfill_orders_address_source.sql` | ok |
| `040_backfill_items_quantity.sql` | ok |
| `042_backfill_transactions_shipping_service.sql` | ok |
| `047_seed_reference_data.sql` | **FAIL** `null value in column "organization_id" of relation "locations"`, then `duplicate key … "services_carrier_name_key"` |
| `049_backfill_shipping.sql` | **FAIL** `new row for relation "shipments" violates check constraint "shipments_addresses_required"` |

**F7 — `029_genesis_backfill.sql` is the one that fills the eight missing
schemas, and it fails on a single statement.** It writes
`products.bullion.stock` and `.quantity`, which `131` drops. Re-run with
per-statement tolerance, everything else in 029 lands (metals 4, mints 10,
organizations 14, leads 233, reviews 6, rates 16, spots 4, images 3) and only
bullion stays empty. Running the same INSERT with those two columns removed
inserts **95** rows. Without that one repair, **production's product catalogue,
metals, spot prices and rates are all empty after the migration**, and the quote
surface — which reads `products.bullion` — returns nothing.

**F8 — `047_seed_reference_data.sql` is not idempotent against January
residue.** It assumes empty tables. `places.locations` went **3 → 6**: it seeded
duplicates of the business's own locations. It also collides on
`services_carrier_name_key` (production already holds 11 `shipping.services`).
Four of its statements error.
**FIXED 2026-09-06** — every insert is now guarded by NOT EXISTS on the fact
that identifies the row, and every reference is a lookup by that fact rather
than a literal id. Re-measured on a production-shaped copy: locations 3, hours
18, services 11, packages 12, methods 11/10, employees 2, stable over three
runs. See `production-day-fixes.md`.

**F9 — `049_backfill_shipping.sql` cannot write a single shipment.**
`048_shipments_addresses_optional.sql` is what drops the
`shipments_addresses_required` check, and 048 is inside the baseline. The
constraint survives on production's January `shipping.shipments`, so 049's
upsert fails for every row: **`shipping.shipments` stays at 41 against
`exchange.shipments`' 71 — 30 shipments never migrate.**
**FIXED 2026-09-06** — 049 now asserts its own precondition, carrying 048's
`DROP CONSTRAINT IF EXISTS` at the top. Re-measured on a production-shaped
copy: `shipping.shipments` **71 of 71**. See `production-day-fixes.md`.

**F10 — `verify:backfill` is broken on this branch and is not in `pnpm check`.**
It fails with the same `column "stock" of relation "bullion" does not exist`,
because it does exactly what production day does: builds genesis into empty
schemas and runs the backfills into them. The one check that models the
production scenario is not gated, so 131 broke it unnoticed.

## 5. Verification

| check | exit | result |
|---|---|---|
| `verify:genesis` | 1 | one DIFF: committed genesis does not match `uat` (§3, expected — `uat` is production's shape, not dev's) |
| `verify:backfill` | 1 | F10 |
| `audit:coverage` | **0** | passes. 3 populated columns with no home, 5 unclaimed tables, all already documented |
| `audit:precision` | 1 | `examined only 30 type difference(s), expected at least 45` |
| `audit:plaintext-secrets` | 1 (by design) | **14 values, 9 customers**, `exchange.payouts.{routing,account}_number`; `payments.details` **empty** |
| `encrypt:payouts --commit` | **0** | **62 of 62** payouts joined `payments.details` to `exchange.payouts`; 14 sealed under key `k1` |
| `encrypt:payouts --verify` | **0** | **28 sealed values verified, 0 mismatched, 0 unopenable** |
| `audit:plaintext-secrets` (after) | 1 (by design) | unchanged at 14 — the script never clears plaintext, by design |
| `verify:genesis:production` | **0** | after the fix below: "production is behind by 14 table(s) and 69 column(s) … genesis reproduces dev from production's shape" |
| `lint:migrations` | **0** | 137 files, no destructive writes to exchange |

**The money path is the good news.** CLAUDE.md records that `encrypt:payouts`
resolves 0 of production's 62 payouts today, because all 56 `payments.details`
rows are January residue sharing no id with a payout. After 071 + 073 that join
is **62 of 62**, and the whole seal-and-verify cycle works on production-shaped
data. The ordering CLAUDE.md insists on is correct and is now measured.

**F11 — `audit:precision`'s floor is calibrated against dev and fires on
production.** It requires ≥45 type differences and finds 30, because `uat`'s
column types are January's, not dev's. The guard is doing its job — it refuses
to call a partial walk clean — but on production day it will read as a failure
when it is a symptom of F6.

**F12 — `verify:genesis:production` gives a false green.** It builds genesis
into scratch schemas, drops the tables and columns production lacks, re-runs
genesis and compares against dev. That models production being **behind**. It
cannot model production being **different**, so it is blind by construction to
every finding in §3: the 25 wrong timestamp types, the 18 missing defaults, the
20 missing `NOT NULL`s and the 14 foreign keys pointing at `core`. It reports
"genesis reproduces dev from production's shape" while none of that is true.
This is the check most likely to be trusted on production day.

### Changed here

`api/scripts/verify-genesis-production.mjs` — two fixes, both contained:

1. `SCHEMAS` now derives from `scripts/lib/schemas.ts` (`NATIVE_SCHEMAS`), the
   way `verify:genesis` does, instead of a hand-kept list. The hand-kept list
   named eight schemas and omitted `checkout`, which production has held since
   January. It now covers 17 and grows on its own. Confirmed against a pristine
   restore: `production has 38 tables across 17 schemas` (was 8).
2. The column name in its `ALTER TABLE … DROP COLUMN` is quoted. Unquoted,
   better-auth's camelCase columns fold to lower case and the script died with
   `column "isanonymous" of relation "users" does not exist`. This was latent —
   `auth` was in the old list too — which is evidence the check had not been run
   against a real production shape.

Nothing else in the repo was changed. No migration was added or edited.

## 6. The test suite, against production-shaped data

The harness cannot be pointed at `uat` by `TEST_DATABASE_URL`: `vitest.config.ts`
defaults `USE_TEST_DB` to `"1"`, and `env.ts` then derives `test_<branch>` from
the git branch and overwrites `DATABASE_URL`. With `USE_TEST_DB=0` and
`DATABASE_URL` set to `uat` it runs unmodified — no harness change needed.

```
TZ=UTC NODE_ENV=test USE_TEST_DB=0 DATABASE_URL=…/uat node node_modules/vitest/vitest.mjs run
Test Files  94 failed | 127 passed (221)
     Tests  363 failed | 902 passed | 11 skipped (1276)
```

**It left nothing behind.** All 90 tables in `uat` were content-hashed before and
after: **zero differences**. The pinned-transaction harness holds against a
production-shaped database.

The failures are the findings above, reproduced by the application itself:

| count | error | finding |
|---|---|---|
| 156 | `null value in column "id" of relation "orders" violates not-null constraint` | **F5** — order creation is impossible |
| 100 | `the test database has no a supplier (refiners.refiners) — reference data is seeded by migration …` | F8 |
| 29 | `new row for relation "shipments" violates check constraint "shipments_addresses_required"` | F9 |
| 11 | `the test database has no the carrier "FedEx"` | F8 |

Nothing reached Stripe, FedEx or email at any point in this rehearsal.

## 7. The covenant

`exchange` was content-hashed table by table before the first migration and
after everything, including the test run. **Two tables differ, both accounted
for:**

- `exchange.schema_migrations` — the ledger itself, created by the runner.
- `exchange.purchase_orders` — **five columns dropped**: `offer_status`,
  `offer_notes`, `offer_sent_at`, `offer_expires_at`, `num_rejections`, by
  `086_offers_go_away.sql`, which carries an explicit `allow-destructive:`
  marker. Sanctioned, and the one irreversible step in the chain. In production
  those columns are populated — `offer_status` 62/62, `num_rejections` 62/62,
  `offer_sent_at` 56, `offer_expires_at` 56, `offer_notes` 2 — so **after this
  migration the dump is the only copy of them.**

No other `exchange` row or column changed. `lint:migrations` stays green.

## 8. Numbers

| | before | after |
|---|---|---|
| schemas | 13 (incl. `core`, `auctions`, `public`) | 19 (incl. `public`) |
| tables | 87 | 90 |
| ledger rows | table did not exist | 137 |
| `orders.orders` | 60 | 72 |
| `orders.items` | 80 | 103 |
| `products.bullion` | (no schema) | 95 |
| `leads.leads` | (no schema) | 233 |
| `metals.metals` / `spots.spots` / `rates.rates` | (no schema) | 4 / 4 / 16 |
| `organizations.organizations` | (no schema) | 15 |
| `reviews.reviews` / `media.images` / `products.mints` | (no schema) | 6 / 3 / 10 |
| `payments.intents` / `.attempts` | 70 / 70 (residue) | 25 / 25 (from `exchange`) |
| `payments.details` | 56 (residue, 10 with bank numbers) | 65 (0 with bank numbers, 14 sealed) |
| `shipping.shipments` | 44 | 41 — **against `exchange.shipments`' 71** |
| `places.addresses` | 118 | 133 |
| plaintext bank rows | 14 in `exchange.payouts` + 10 in `payments.details` | 14 in `exchange.payouts` |

---

# THE PRODUCTION-DAY RUNBOOK, as it now stands

Everything below is the user's to run. Nothing here is safe to hand to an agent,
and steps 0 and 1 are blockers that no amount of care at step 5 makes up for.

### 0. Before anything — the three blockers

- **Get an owner-role connection string.** `PROD_READONLY_DATABASE_URL` cannot
  produce a data dump (F1). Either dump as `dorado`/superuser, or grant the
  read-only role `USAGE ON SCHEMA core, auctions` and `SELECT ON ALL SEQUENCES
  IN SCHEMA exchange, auctions` first.
- **Decide what happens to `core`** (F4). It is 294 rows across 9 tables, all
  January copies of `exchange` data whose ids resolve in `exchange` 100%. Seven
  live tables are foreign-keyed to it, and those keys must be repointed at
  `products.bullion` / `metals.metals` / `media.images` /
  `organizations.organizations` after the backfill. This wants a migration; it
  is not a runbook step.
- **Decide about `086_offers_go_away.sql`** (§7). It drops five populated
  columns from `exchange.purchase_orders`. The dump is the only copy afterwards.

### 1. Dump — with a credential that can

```bash
/usr/lib/postgresql/16/bin/pg_dump -Fc --no-owner --no-privileges \
  -f dorado-prod-$(date +%Y%m%d).dump "$OWNER_PROD_URL"
```
The client must be 16, not the 14 on `PATH`. Verify the TOC before trusting it:
`pg_restore -l <file> | grep -c 'TABLE DATA'` should be 87, `SEQUENCE SET` 4.

### 2. Restore into a scratch copy and prove it whole

```bash
createdb -h 127.0.0.1 -p 5544 uat
psql -d uat -c "ALTER DATABASE uat SET TimeZone='UTC';"      # F2 — do this FIRST
pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5544 -d uat <file>
pnpm --filter @dorado/api compare:databases \
  --source PROD_READONLY_DATABASE_URL --target DATABASE_URL
```
Without the `TimeZone` line the comparison reports ~17 differences that are not
real. `core` and `auctions` will still show as unreadable on the source unless
the grants in step 0 were made.

### 3. Rehearse on the copy. Do not skip to production.

Everything from step 4 down runs against `uat` first, with
`MIGRATE_ALLOW_DB=uat`.

### 4. Pre-flight: clear the January payments residue

Genesis cannot build `attempts_provider_ref_key` while it is there (F-genesis).
These are the four DELETEs from `071_remove_the_payments_residue.sql`, run
early; 071 then re-runs later and deletes nothing.

```sql
DELETE FROM payments.settlements s WHERE NOT EXISTS (
  SELECT 1 FROM payments.attempts a WHERE a.id = s.attempt_id
    AND EXISTS (SELECT 1 FROM exchange.payment_intents e WHERE e.id = a.intent_id));
DELETE FROM payments.attempts a WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payment_intents e WHERE e.id = a.intent_id);
DELETE FROM payments.intents i WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payment_intents e WHERE e.id = i.id);
DELETE FROM payments.details d WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payouts p WHERE p.id = d.id);
```
Expect `70 / 70 / 70 / 56`. The 56 includes the ten rows holding bank numbers
that 071 was written to remove.

### 5. Migrate

```bash
MIGRATE_ALLOW_DB=<db> pnpm --filter @dorado/api migrate
```
It will stop repeatedly (F3, F5). Nothing in the runner stamps a migration
without running it, so **each stop needs a decision**; the rehearsal stamped
them by hand into `exchange.schema_migrations`. Re-run 2026-09-06 with the
migrations as they now stand, the stops were 064, 066, 070, 083, 088, 090, 092,
093, 094, 101, 102, 120, 129 and 132. 088/090/092/101/102 are provably no-ops
against a genesis-built database — their objects already exist or their columns
are gone by 131. **The metal-typed ones (064, 066, 070, 083, 120, 132, and 093
/ 094 behind them) are the newest face of F6**: 132 made `metals.metals.id`
text, genesis therefore cannot add the metal foreign keys to production's
January `uuid` columns, and ten genesis statements fail with it. That wants a
migration that converts those columns the way 132 does, not a stamp.
**129 is not a no-op either**: it is a guard, and it is correct. Do not stamp
past it without first adding the two defaults:

```sql
ALTER TABLE orders.orders       ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders.transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
```
Without these, production cannot create an order (F5, and 156 test failures).

### 6. Backfill — the nine the baseline stamped

In order: 029, 031, 034, 036, 038, 040, 042, 047, 049. Three need care:

- **029** — remove `stock` and `quantity` from the `products.bullion` INSERT
  (131 drops both). Without this the catalogue is empty (F7). Expect 95 rows.
- **047** — FIXED (2026-09-06). It is idempotent by natural key now and needs
  nothing; expect locations 3, hours 18, services 11, packages 12, methods
  11/10, employees 2.
- **049** — FIXED (2026-09-06). It drops `shipments_addresses_required` itself;
  expect `shipping.shipments` to equal `exchange.shipments`, 71 of 71.

### 7. Verify

```bash
pnpm --filter @dorado/api verify:genesis          # will report drift; read §3
pnpm --filter @dorado/api verify:backfill         # green since 2026-09-06
pnpm --filter @dorado/api audit:coverage
pnpm --filter @dorado/api audit:precision         # floor will fire — F11
pnpm --filter @dorado/api audit:plaintext-secrets
```
Do **not** trust `verify:genesis:production` as the gate (F12). The gate that
actually caught everything was the API test suite run against the restored copy:

```bash
TZ=UTC NODE_ENV=test USE_TEST_DB=0 DATABASE_URL=<copy> \
  node node_modules/vitest/vitest.mjs run
```
It leaves no rows behind, and on an unrepaired migration it fails 363 tests.

### 8. Seal the bank numbers — 071, then 073, then the script

```bash
pnpm --filter @dorado/api encrypt:payouts --commit
pnpm --filter @dorado/api encrypt:payouts --verify
```
Order confirmed by rehearsal: after 071 and 073 the join is **62 of 62** (it is
0 of 62 before them), 14 rows seal, 28 values verify. The script does not clear
the plaintext — that migration does not exist yet and is deliberately Jacob's.

### 9. Only then

`compare:databases` against the copy, then merge. Not before, and not by an
agent.
