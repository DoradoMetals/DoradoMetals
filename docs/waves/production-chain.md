# The production chain — ruling 82, rehearsed end to end (2026-09-06)

Branch `chain-lane`, worktree `/home/jtj60/dorado-lanes/chain`.

**Ruling 82** (Jacob, 2026-09-06): *"Drop and rebuild seems to make more sense.
As long as it's not dropped exchange (until we've had a few weeks to verify all
the new data is there and everything works)."*

Production's abandoned January schemas are DROPPED after the dump, and genesis
plus the backfills rebuild everything from `exchange` — the way dev was built,
and the only case the toolchain actually tests. `exchange` is never dropped,
never truncated, never deleted from.

**The result.** On a fresh copy of `uat_pristine` (the production-shaped
restore), the reset plus a single `migrate` run applies **all 139 migrations
with ZERO aborts**, and the rebuilt database's native catalogue is **identical
to dev's** — 51 tables, 631 columns, 231 indexes, 195 constraints, 2 sequences,
1 function, 4 views, 26 triggers, 8 enums: **0 differences of any kind**.
The UAT rehearsal's fourteen stops (`uat-rehearsal.md` F3–F6, and the ten
genesis statements `production-day-fixes.md` closes with) are gone, not
worked around.

Production itself was never connected to. Every number below was measured on a
local copy. No customer row appears here — counts only.

The rebuilt database is left on the local cluster (`127.0.0.1:5544`) as
**`chain6`** for inspection, beside `uat_pristine` (production, untouched).
Six earlier scratch copies were created and dropped.

---

## 1. The reset step

`pnpm --filter @dorado/api migrate:reset-january`
(`api/scripts/reset-january.ts`). Dry by default; `--commit` drops.

### What it drops, and what it cannot

The drop list is **`pg_namespace` MINUS a hard-coded protected set**, never an
allowlist — an allowlist goes stale the moment production turns out to hold a
schema nobody listed, and `core` and `auctions` are exactly that case. The
protected set lives in `api/scripts/lib/schemas.ts` beside `NATIVE_SCHEMAS`:

```
PROTECTED_SCHEMAS         exchange, public, information_schema
PROTECTED_SCHEMA_PREFIXES pg_
```

`exchange` is first for a reason. It is filtered out when the list is computed,
**asserted against the protected set again after the list is built**, and
checked a **third** time immediately before each `DROP SCHEMA` executes. The
script issues no `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` at all — only
`DROP SCHEMA`, only on names that survived all three gates.

### The guards, each of which refuses before anything happens

| guard | refusal |
|---|---|
| `--database <name>` | absent → refuses. It will not infer a target from the environment and never reads `DATABASE_URL` on its own. |
| `--url <string>` | absent → refuses. Naming the database is not enough. |
| url vs name | the URL's database ≠ `--database` → refuses. |
| connected database | `current_database()` ≠ `--database` → refuses. |
| `--dump <file>` | absent → refuses; missing → refuses; a directory → refuses; **zero bytes → refuses**. Ruling 82 drops AFTER the dump. |
| no exchange | the target has no `exchange` schema → refuses ("that is not a Dorado database"). |
| protected name in the list | refuses, and says there is no flag for it. |
| dry by default | prints the plan and the evidence; `--commit` is the only way to drop. |
| after the drop | re-reads `pg_namespace`; a survivor, or a missing `exchange`, is a hard failure. |

### The precondition it prints

Before dropping, it prints ruling 82's evidence: **every table in every schema
it will drop, its row count, and the newest timestamp any of its timestamp
columns holds**, so the operator can see for themselves that what is going is
January residue. On the production-shaped copy:

```
49 table(s) across 11 schema(s), 2656 row(s), newest timestamp anywhere: 2026-01-20.
```

Eleven schemas: `auctions, auth, checkout, core, fulfillments, orders,
payments, places, refiners, shipping, tax`. Nothing in any of them is newer
than **2026-01-20**, while `exchange` has writes through 2026-08-24. That is
the ruling, measured rather than asserted.

### The self-test

`pnpm --filter @dorado/api migrate:reset-january:self-test` — **9 cases, no
database**, exercising the real code path through `--check-plan --schemas a,b,c`:

- `exchange` never appears in the drop list, however the catalogue presents it;
- a database holding only `exchange` has nothing to drop;
- `public`, `information_schema` and `pg_*` are protected by construction;
- **a protected name planted in the list is caught** (`RESET_JANUARY_INJECT_PROTECTED`
  adds a name to what is CHECKED and never to what is returned, so the hook
  cannot itself drop anything);
- refuses without `--database`, without `--dump`, on a missing dump, on a
  **zero-byte** dump, and when `--url` names a different database.

`lint:migrations` continues to guarantee the other half — no migration file may
`DROP SCHEMA exchange`, `DROP TABLE exchange.*`, `DELETE FROM exchange.*`,
`UPDATE exchange.*` or narrow an `exchange` column type without an explicit
`allow-destructive:` marker.

### Is dropping `auth` what 107 wants? YES — checked

`107_auth_cutover.sql` begins by DELETEing two January ghost rows from
`auth.users` (and their sessions and credentials), then reconciles
`auth.users` / `auth.sessions` / `auth.account` / `auth.verification`
**wholesale from `exchange`** with `ON CONFLICT (id) DO UPDATE`. Every row it
needs comes from `exchange`; nothing it does reads a January `auth` row for
anything but deletion. Dropping `auth` first therefore gives 107 exactly the
state it wants and removes the ghosts by construction — including the one
sharing Jacob's email with a January-era password that would have become
loginable. `056` and `057` run earlier in the chain and populate `auth.users`
before anything joins it. Measured: `auth.users` **75** after the rebuild
(60 January rows dropped, 73 derived from `exchange.users`, plus the two
harness actors and the e2e pair added afterwards by hand for the test run).

---

## 2. The baseline: what `-- baseline: 002-049` had to become

**`-- baseline: 002-049` was the single bug the UAT rehearsal met six times.**
Genesis is GENERATED FROM DEV, which has every migration applied, so the shape
it creates is the shape after **all** of them — not the shape after 049. The
marker understated that by eighty-four files, so 050 onwards were replayed
against a database that already held their result: every migration naming a
column a later one drops, or creating an object genesis already created,
aborted the chain.

Three changes, together, make a from-nothing build work.

### 2a. The range now runs to the head — and is DERIVED, not typed

In `api/scripts/dump-schema.mjs` (the generator) and the committed
`000_genesis_schema.sql`, whose header now explains all of the below.
`verify:genesis` proves the two still match byte for byte. 001 stays outside
the range: it indexes foreign keys on `exchange`, which any real database wants.

**A typed marker goes stale, and did.** `002-133` became `002-134` and then sat
there while the lanes added 135 to 265 and genesis was regenerated behind every
one of them. On 2026-10-09 a replay from the 2026-08-25 production dump aborted
at `169_a_refiner_orders_money_has_one_definition.sql`:

```
169 ... FAILED
  cannot drop columns from view
```

169 creates `refining.order_money` with six columns; 263 had given the view
eight; genesis held the eight; Postgres will not drop columns from a view.
Everything from 135 to 265 was being replayed on top of its own end state and
only happened to be idempotent — `IF NOT EXISTS` and "already exists, skipping"
run the length of that log.

So `through` is now READ FROM THE DATABASE THE DUMP IS TAKEN FROM: the newest
migration `exchange.schema_migrations` records there, minus any marked
`runs-even-under-a-baseline`. `pnpm dump:schema` cannot emit a marker that
disagrees with the shape it emits, and `verify:genesis` asserts the committed
marker by name as well as byte for byte.

### 2a-bis. The split is per FILE, so four files must always run

A covered migration that carries rows replays its DDL too, because a backfill's
own `ALTER`s are part of how it writes its rows — 233 disables the audit trigger
around its `UPDATE`. Four files are on the wrong side of that and now carry
`-- runs-even-under-a-baseline`, found by replaying the dump with the range at
265:

| file | what stamping it cost |
|---|---|
| `159a` | it re-adds the eleven columns 188/190/191 drop and 160–179 still write. Stamped, 160 aborts: `column split_from_id referenced in foreign key constraint does not exist` |
| `179` | it adds `inventory.lots.combined_into_id`, which 188 turns into a `combine` edge and drops. Stamped, 188 aborts: `column li.combined_into_id does not exist` |
| `170` | 166 creates `dropoffs_driver_fk` into `auth.users` and RUNS; only 170 removes it. Stamped, the rebuild keeps a foreign key dev does not have |
| `191` | 159a re-adds four `orders.lots` columns and RUNS; only 191 removes them. Stamped, the rebuild keeps four columns dev does not have |

`266_the_money_view_survives_the_rebuild.sql` is the fifth case from the other
side: 190 carries rows, so it replays and rewrites `refining.order_money` back
to six columns, and 263 is stamped. 266 restates the view — genesis's own
definition, character for character — and carries the marker so it is never
stamped itself.

### 2a-ter. `verify:replay` is what catches the next one

`verify:genesis` compares genesis with dev. It never REPLAYS, so no migration
after the baseline is ever put on top of the shape genesis holds — which is why
the gate was green while the chain was broken.

`pnpm --filter @dorado/api verify:replay` (a `dev-db` member of `pnpm check`)
does the replay for real. It creates `uat_replay` on the LOCAL cluster
`TEST_DATABASE_URL` names, copies `exchange` into it — tables, sequences,
defaults, keys, indexes and rows, no foreign keys and no triggers, since
nothing in the chain writes it — hands the real `scripts/migrate.mjs` that
database, and then compares all twenty schemas against `DATABASE_URL` by
relation, column, constraint, index, enum, function, trigger and view
definition. It runs `migrate` a second time to prove the second run applies
nothing.

Put the old marker back and it says the production-day line verbatim:
`169 ... FAILED / cannot drop columns from view`. Take 266 away and it says
`the replay is missing column: refining.order_money.pool_oz_remediated`.

### 2b. A BASELINE STAMPS SHAPE, NEVER ROWS

`api/scripts/lib/baseline.ts` gained `splitStatements` (moved out of
`migrate.mjs`, which now imports it) and `isDdlOnly`. The runner splits the
covered set: a migration whose every statement is pure DDL is **stamped**, and
one that carries rows **RUNS**, in its own place in the order.

The verb list is an **allowlist** — `CREATE ALTER DROP COMMENT GRANT REVOKE SET
RESET REINDEX CLUSTER ANALYZE SECURITY` — so a verb nobody thought of is treated
as data and runs. That is the safe direction: running a migration that turns out
to be a no-op costs a second; skipping one that turns out to carry rows costs
the rows. Stamping the nine backfills inside 002-049 is how the rehearsal ended
with an empty product catalogue, no metals, no spot prices and no rates (F7).

Three refinements were forced by measurement:

- **A `DO` block is judged by its body.** Most of them are
  `IF NOT EXISTS … CREATE TYPE` guards, which is shape and nothing else; one
  holding `INSERT|UPDATE|DELETE|MERGE|COPY|EXECUTE|TRUNCATE` is data. Comments,
  string literals and the referential-action words are stripped first, so
  `ON DELETE SET NULL` and `FOR UPDATE` are not mistaken for statements.
- **GENESIS CREATES NO SEQUENCES.** `dump-schema.mjs` emits schemas, enums,
  tables, columns, constraints, indexes, views and functions — and nothing
  else. Stamping `079` and `115` left the rebuilt database without
  `orders.purchase_number_seq` / `orders.sale_number_seq`, so **production
  could not create an order** — F5's symptom from a different cause. Any
  statement naming a `SEQUENCE` or `setval(` now runs.
- **GENESIS CREATES NO TRIGGERS**, and CLAUDE.md says so on purpose: 116's
  `audit_stamp` runs after the backfills so a backfill reproduces `exchange`'s
  own audit columns instead of stamping itself. Stamping `116` left **26 tables
  with no audit trigger**; stamping `133` left the two retired `auth` mirrors
  alive. Any statement naming a `TRIGGER` now runs.

### 2c. Two markers, both with a mandatory reason

| marker | meaning | files |
|---|---|---|
| `-- superseded-by-genesis: <why>` | the file's whole work, data included, is already in genesis or is re-derived later, and its target no longer exists | `003`, `010`, `011`, `018` |
| `-- runs-even-under-a-baseline: <why>` | looks like pure DDL genesis reproduces, and is not, because it undoes something a migration that DOES run has just done, or repairs a shape genesis no longer carries | `027a`, `131`, `159a`, `170`, `179`, `191`, `266` |

A reason under 20 characters throws rather than being honoured — a marker that
says nothing is a skipped migration nobody can audit.

- **003 / 010** backfill `core.leads` / `core.reviews`, dissolved by 013;
  `029_genesis_backfill.sql` copies the same `exchange` rows into `leads.leads`
  and `reviews.reviews` instead.
- **011** adds audit columns to `core.*` and `orders.offers`, all gone;
  genesis already carries them everywhere else.
- **018** adds `media.images.user_id` / `created_at` (genesis has both) and
  re-inserts the images — without 029's dangling-user subselect, so its FK to
  the still-empty `auth.users` refused every row. 029's
  `WHERE path IS NOT NULL AND filename IS NOT NULL` excludes nothing production
  holds: **3 of 3**.
- **131** drops `products.bullion.stock` and `.quantity`. `023` adds them and
  RUNS (it carries an `UPDATE`), so only 131 removes them again; stamped, the
  rebuilt catalogue kept two columns dev does not have.

### 2d. The runner refuses to stamp against a non-empty schema

`assertNothingToSupersede` in `api/scripts/migrate.mjs`: before applying a
migration that carries a baseline marker **and actually covers something**, the
runner counts base tables per schema and refuses if any non-protected schema
holds one. Genesis's DDL is `IF NOT EXISTS` throughout and cannot repair a
table that already exists, so the stamping is only sound on a from-nothing
build. The refusal names `migrate:reset-january` and the flags to run it.

On dev, genesis is already in the ledger, nothing is covered and the check
never fires. On a genuinely empty database there are no schemas and it passes.
On production before the reset it refuses — which is the point. Measured on an
un-reset copy of `uat_pristine`: exit 1, nothing applied (`orders` still holds
its six January tables), and the message names all eleven schemas with their
table counts and the exact `migrate:reset-january` line to run.

**Result on the production-shaped copy:** `baseline 002-133: stamped 74 DDL, 63
carry data and still run`.

---

## 3. The migrations fixed, and why

Each is additive, each keeps dev green (`verify:genesis` and `verify:backfill`
both pass on dev in `pnpm check`), and none writes `exchange`.

| file | what broke on a genesis build | fix |
|---|---|---|
| `016_spots_current_quote_per_metal.sql` | `ADD CONSTRAINT spots_one_per_metal` — genesis has it; `ADD CONSTRAINT` has no `IF NOT EXISTS`. Then `JOIN metals.metals m ON m.name = e.type` — 132 made `id` the metal's NAME and dropped `name` | guarded on `pg_constraint`; the join reads `coalesce(to_jsonb(m)->>'name', m.id::text)`, right on both shapes |
| `026_mints_description_and_constraints.sql` | `mints_name_key` and `mints_type_check` already exist | both guarded on `pg_constraint` |
| `031_backfill_orders.sql` | `order_addresses_source_address_id_fkey` is **DEFERRABLE INITIALLY DEFERRED** into `places.addresses`, which 050 does not fill until nineteen migrations later. Inside one transaction that never mattered (`verify:backfill` rolls back and the deferred check never runs); migration by migration, 031 commits alone and every `source_address_id` dangles | 031 inserts the source addresses itself first, `ON CONFLICT (id) DO NOTHING`. 050 re-inserts the same rows from the same columns with `DO UPDATE`, so the end state is unchanged |
| `032_correct_stale_order_audit.sql` | third `UPDATE` targets `orders.offers`, removed by 086 | guarded on `to_regclass('orders.offers')` |
| `034_backfill_orders_missing_columns.sql` | reads `exchange.purchase_orders.pool_remediation` and `.pool_oz_deducted` — **DEV HAS THEM AND PRODUCTION DOES NOT.** No migration adds them; they were added to dev by hand. This aborted the whole file | read through `(to_jsonb(p) ->> '…')::numeric`, which yields NULL where the column is absent and the value where it is present |
| `062_exchange_is_the_source_of_truth.sql` | `DELETE FROM orders.offers` | guarded on `to_regclass` |
| `064_refiner_items_hold_the_refiners_numbers.sql` | its INSERT wrote `exchange`'s metal **uuid** into `refiners.items.metal_id`, which is the metal's NAME since 132 → FK violation | resolved through `exchange.metals`, exactly as the `UPDATE` above it already did |
| `088_catch_the_new_schema_up_with_the_stale_server.sql` | refreshes `products.bullion.sell_display` (dropped by 119) and `.stock` / `.quantity` (dropped by 131) | the three columns are dropped from the refresh — there is nowhere left to write them, and `exchange` keeps its own copies |
| `092_the_lifecycle_loses_the_offer_statuses.sql` | `ALTER TYPE media.email_kind RENAME VALUE 'purchase_order_accepted'` — genesis has the post-092 enum | guarded on `pg_enum` |
| `128_the_handover_lives_with_the_fulfillment.sql` | sections 2–5 read nine columns of `checkout.checkouts` that **section 6 of the same file drops**, so on a genesis build they cannot even parse | the whole data half is guarded on one of those columns and run through `EXECUTE`, which defers the parse. Nothing is lost: a genesis build has no carts, because checkout is device-sync and no backfill writes it |

### Tooling fixed with them

- **`api/scripts/compare-databases.mjs` — F2 closed.** It fingerprints with
  `md5(string_agg(t::text, …))`, and `t::text` renders `timestamptz` in the
  session time zone, so two servers set differently disagree about identical
  rows. Both connections now `SET TimeZone='UTC'`, `DateStyle='ISO, MDY'` and
  `intervalstyle='postgres'` on connect. Measured: comparing the pristine
  production copy against the rebuilt one reported **9 exchange tables
  "contents differ"** before the fix and **1** after — the eight were the clock.
  On production day that is the difference between a restore that looks half
  broken and one that is provably whole.
- **`api/scripts/verify-backfill.mjs` — `EXTRA_BACKFILLS`.** The rebuild picks
  its migrations by filename (`backfill|seed` above 028), which cannot see
  `114_the_payout_reads_leave_exchange.sql` — the file that derives
  `payments.details.last_four` and `routing_last_four` from
  `exchange.payouts`. **Invisible on dev and loud on production**: dev's
  `exchange.payouts` holds no bank numbers at all, so both sides of the
  comparison are null and it passes for the wrong reason; on the rebuilt
  production copy it was 14 rows. 114 is now named explicitly, with a reason,
  and a missing or unreasoned entry is a hard error.

---

## 4. The sequence, run end to end

`createdb -T uat_pristine chain6`, `ALTER DATABASE chain6 SET TimeZone='UTC'`,
then:

| # | step | exit | result |
|---|---|---|---|
| 1 | `reset-january … --commit` | **0** | 11 schemas, 49 tables, 2656 rows dropped; newest timestamp anywhere 2026-01-20; `exchange` intact |
| 2 | `MIGRATE_ALLOW_DB=chain6 migrate` | **0** | **139 migrations, ONE run, zero aborts.** `baseline 002-133: stamped 74 DDL, 63 carry data and still run` |
| 3 | catalogue diff vs dev (17 native schemas) | — | **0 differences** across tables, columns (type/null/default), indexes, constraints, sequences, functions, views, triggers, enums |
| 4 | `verify:genesis` | **0** | "identical to dev, and the committed genesis matches" |
| 5 | `verify:backfill` | **0** | 32 tables, 2575 rows, **no undeclared differences** |
| 6 | `audit:coverage` | **0** | 3 populated columns with no home, all already documented |
| 7 | `audit:precision` | **0** | 0 columns whose value the target type would change (59 type differences examined) |
| 8 | 071 + 073 | **0** | ran inside the chain — both carry data, so the baseline no longer stamps them |
| 9 | `encrypt:payouts --commit` | **0** | **62 of 62** payout accounts joined `payments.details` to `exchange.payouts`; **14 sealed** under key `k1` |
| 10 | `encrypt:payouts --verify` | **0** | **28 sealed values verified, 0 mismatched, 0 unopenable** |
| 11 | `audit:plaintext-secrets` | 1 (by design) | unchanged at 14 in `exchange.payouts`; `payments.details` **empty of plaintext**. The script never clears plaintext — that migration is Jacob's |
| 12 | API suite against the copy | 1 | **1343 of 1344** — see §6 |

### The counts

| | pristine (production) | rebuilt |
|---|---|---|
| schemas / native tables | 13 (incl. `core`, `auctions`) / 49 January | 19 / **51**, no `core`, no `auctions` |
| ledger | table did not exist | **139** |
| `orders.orders` / `.items` / `.transactions` | 60 / 80 / — (January) | **72** / **103** / **72** |
| `products.bullion` | no schema | **95** = `exchange.products` 95 |
| `shipping.shipments` | 44 (January) | **71** = `exchange.shipments` 71 |
| `shipping.tracking` | 427 | **530** |
| `places.addresses` / `user_addresses` | 118 | **145** / 73 |
| `auth.users` | 60 January | **75** |
| `payments.intents` / `.attempts` / `.details` | 70 / 70 / 56 residue | **25** / 25 / **65** |
| `metals` / `spots` / `rates` / `organizations` | no schema | 4 / 4 / 16 / 15 |
| `leads` / `reviews` / `media.images` / `mints` | no schema | 233 / 6 / 3 / 10 |
| `refiners.items` / `.spots` / `fulfillments` | — | 103 / 288 / 71 |
| reference data | duplicated by 047 in the old chain | locations 3, hours 18, services 11, packages 12, fulfillment methods 11, payment methods 10 |
| `orders.purchase_number_seq` / `sale_number_seq` | did not exist | **340 / 63**, one ahead of the highest order number on each side |

**An order can be created.** `orders.orders.id` and `orders.transactions.id`
both carry `DEFAULT gen_random_uuid()`; `nextval('orders.purchase_number_seq')`
returns **341** against a maximum of 340, and the sale sequence returns **64**
against 63. **No foreign key points at `core`** — the schema is gone and
`pg_constraint` confirms zero references to it.

### The covenant

`compare:databases` between `uat_pristine` and the rebuilt copy, with the
timezone fix, reports **exactly two `exchange` differences and no others**:

- `exchange.schema_migrations` — the ledger, created by the runner.
- `exchange.purchase_orders` — **five columns dropped** (`offer_status`,
  `offer_notes`, `offer_sent_at`, `offer_expires_at`, `num_rejections`) by
  `086_offers_go_away.sql`, which carries an explicit `allow-destructive:`
  marker. Row count unchanged at 62/62. 092's status rewrites changed **nothing**
  — production holds no `Accepted`, `Offer Sent` or `Rejected` purchase order
  (4 Cancelled, 56 Completed, 2 In Transit, identical on both sides).

Every other `exchange` table is byte-identical. `lint:migrations` stays green.

---

## 5. What `verify:backfill` says about a production rebuild

Exit 0, no undeclared differences, and the scoping lines are worth reading
because their labels were written for dev:

```
out of scope: 92 written natively after the pivot, 0 that exchange holds and dev
              no longer does, 70 minted by the rebuild with a generated id
declared:     62 value(s) on columns native code owns
```

Nothing was "written natively" on a rebuilt production database. The 92 are:

- **70 `places.addresses`** — 031's per-order snapshots, minted with
  `gen_random_uuid()`, which can never match by key. Expected and declared.
- **14 `refiners.items` and 8 `refiners.spots`** — SALES-order rows created by
  `093` and `094`, which are data migrations that RUN but are not named
  `backfill`, so the rebuild does not replay them. Confirmed: all 14
  `order_item_id`s resolve in `exchange.sales_order_items` and none in
  `exchange.purchase_order_items`. Not a defect; the same class as 114, and a
  candidate for `EXTRA_BACKFILLS` if someone wants the comparison tighter.
- **62 `orders.transactions.updated_at`** — declared drift, 116's audit trigger.

---

## 6. The API suite against the rebuilt copy

```
TZ=UTC NODE_ENV=test USE_TEST_DB=0 DATABASE_URL=<copy> \
  node node_modules/vitest/vitest.mjs run
```

The harness points cleanly: `vitest.config.ts` defaults `USE_TEST_DB` to `"1"`
and `env.ts` then derives `test_<branch>`; with `USE_TEST_DB=0` it runs
unmodified. Two harness fixtures have to exist first — they are seeded by
`scripts/preflight-test-db.ts`, not by any migration:

```sql
INSERT INTO auth.users (id, email, name, role, "emailVerified") VALUES
  ('00000000-0000-4000-8000-0000000ac700','zz-test-actor@dorado.test','Test Actor','user',true),
  ('00000000-0000-4000-8000-0000000c5700','zz-test-customer@dorado.test','Test Customer','user',true)
ON CONFLICT (id) DO NOTHING;
```

Without them: 26 failures, every one a missing-fixture error
(`checkout_user_fk`, "customer … is absent from GET /api/users"). With them:

```
Test Files  1 failed | 236 passed (237)
     Tests  1 failed | 1342 passed | 1 skipped (1344)
```

against the UAT rehearsal's **363 failures**. F5's 156 order-creation failures,
F8's 111 reference-data failures and F9's 29 shipment failures are all gone.

**The one that remains is a real finding and is NOT a migration defect.**
`media/pdfs/tests/service.test.ts` — *"every purchase order in dev builds both
documents"* — reports:

```
order 328: packing list contains NaN
order 272: packing list contains NaN
order 259: packing list contains NaN
```

Three of production's 62 purchase orders render a packing list with `NaN` in
it. It appears only against production data and is invisible on dev. 259 has a
scrap line with a NULL `quantity` (12 orders do, and only this one is
affected); 272 and 328 do not, so NULL quantity is not the whole cause — 272
and 328 carry scrap lines in `g` and `dwt` respectively. **This wants its own
lane in `media/pdfs`; do not treat it as part of the migration.**

---

# THE PRODUCTION-DAY RUNBOOK

**This replaces the runbook at the end of `docs/waves/uat-rehearsal.md`.**
Everything here is Jacob's to run. Nothing here is safe to hand to an agent.
Steps 0 and 1 are blockers no amount of care later makes up for.

### 0. The three blockers, unchanged

- **An owner-role connection string.** `PROD_READONLY_DATABASE_URL` cannot
  produce a data dump (F1): it lacks `USAGE` on `core` and `auctions` and
  `SELECT` on four sequences, and an owned sequence is dumped with its table
  regardless of `-T`. Dump as `dorado`/superuser, or grant
  `USAGE ON SCHEMA core, auctions` and `SELECT ON ALL SEQUENCES IN SCHEMA
  exchange, auctions` first.
- **`086_offers_go_away.sql` drops five populated columns** from
  `exchange.purchase_orders` (`offer_status` 62/62, `num_rejections` 62/62,
  `offer_sent_at` 56, `offer_expires_at` 56, `offer_notes` 2). After it, the
  dump is the only copy. It carries an `allow-destructive:` marker and is the
  one irreversible step in the chain.
- **`core` is no longer a decision.** Ruling 82 drops it with the rest, and the
  fourteen foreign keys that pointed at it are gone with the tables that carried
  them. Verified: zero constraints reference `core` after the rebuild.

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
psql -d uat -c "ALTER DATABASE uat SET TimeZone='UTC';"
pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5544 -d uat <file>
pnpm --filter @dorado/api compare:databases \
  --source PROD_READONLY_DATABASE_URL --target UAT_URL
```

`compare:databases` now pins both sessions to UTC itself, so the seventeen
false differences the rehearsal met are gone. `core` and `auctions` still show
as unreadable on the source unless the grants in step 0 were made.

### 3. Rehearse on the copy. Every step below runs against `uat` FIRST.

### 4. Reset — drop the January schemas

```bash
pnpm --filter @dorado/api migrate:reset-january -- \
  --database uat --url "$UAT_URL" --dump <the dump from step 1>
```

Dry. **Read what it prints**: the schema list, and every table's row count and
newest timestamp. Nothing should be newer than about 2026-01-20. Then:

```bash
pnpm --filter @dorado/api migrate:reset-january -- \
  --database uat --url "$UAT_URL" --dump <the dump> --commit
```

It ends with `exchange is intact. Run migrate next.` `exchange` is never in the
list and cannot be.

> The old step 4 — running 071's four DELETEs by hand to clear the January
> payments residue before genesis — **is gone**. The residue goes with the
> schemas, and 071 re-runs later and deletes nothing.

### 5. Migrate — one run, no stops

```bash
MIGRATE_ALLOW_DB=uat pnpm --filter @dorado/api migrate
```

Expect `applied <every file in api/migrations> migration(s)` — 139 when this
was first measured at head 133, 167 at head 173 — and, on the genesis line,
`(baseline 002-133: stamped 74 DDL, 63 carry data and still run)`, which does
not move as the head advances: everything above 133 runs in its own place.

**Read the indented NOTICE lines.** The runner prints them now (phones lane),
and two migrations report facts the operator is meant to see:

- **161** — `N open lot(s) regenerated their content` and `N settled scrap
  lot(s) keep what was paid … N beyond 1e-3: <ids>`. On production data that
  last number is **1**, and the id is
  `2f531d4a-b9f0-40d1-b536-21322d2e5544` on purchase order 270. **That is
  expected, documented and not a stop** — see
  `docs/waves/lots-backfill-production.md`. 161 still ABORTS if an OPEN
  order's lot disagrees with its derivation by more than 1e-3, because that
  one can still be re-priced.
- **172** — how many customers got a sign-in number, and the ids of any two
  who would have shared one. Those two need a human, not a re-run.

**If it stops, do not stamp past it.** Every stop the rehearsal met is fixed at
source. A new one is a new finding.

Measured again 2026-09-11 (lot161 lane) on a `createdb -T chain6` copy, which
starts at head 133: **134 → 173, 28 migrations, one run, zero aborts.**

> The old step 6 — running the nine baseline-stamped backfills by hand — **is
> gone**. They carry rows, so the baseline no longer stamps them and they run
> in their own place in the order.

### 6. Verify

```bash
pnpm --filter @dorado/api verify:genesis          # expect 0
pnpm --filter @dorado/api verify:replay           # expect 0
pnpm --filter @dorado/api verify:backfill         # expect 0
pnpm --filter @dorado/api audit:coverage          # expect 0
pnpm --filter @dorado/api audit:precision         # expect 0
pnpm --filter @dorado/api audit:plaintext-secrets # exits 1 by design
```

Then the gate that actually catches things — the API suite against the
restored copy, with the two harness actors from §6 inserted first:

```bash
TZ=UTC NODE_ENV=test USE_TEST_DB=0 DATABASE_URL=<copy> \
  node node_modules/vitest/vitest.mjs run
```

Expect 1343 of 1344, the one failure being the packing-list `NaN` (§6). It
leaves no rows behind: all tables were content-hashed before and after in the
earlier rehearsal with zero differences.

Do **not** trust `verify:genesis:production` as the gate (F12): it models
production being BEHIND and cannot model it being DIFFERENT.

### 7. Seal the bank numbers

071 and 073 run inside the chain now, so the join they establish is already
there. Then:

```bash
pnpm --filter @dorado/api encrypt:payouts --commit
pnpm --filter @dorado/api encrypt:payouts --verify
```

Expect **62 of 62** joined, **14 sealed**, **28 values verified, 0 mismatched,
0 unopenable**. The script does not clear the plaintext in `exchange.payouts`;
that migration does not exist and is deliberately Jacob's.

### 8. Prove the covenant on the copy

```bash
pnpm --filter @dorado/api compare:databases --source PRISTINE_URL --target UAT_URL
```

Only two `exchange` differences are acceptable: `schema_migrations` (the
ledger) and `purchase_orders` (086's five columns). **Anything else means
stop.**

### 9. Only then — production itself

Repeat steps 4 to 8 against production, in that order, with
`MIGRATE_ALLOW_DB=<prod database name>`. Then merge. Not before, and not by an
agent.
