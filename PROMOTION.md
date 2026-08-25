# Promotion runbook

How to move this migration onto production, and how to undo each step.

Written against production as it actually is — read directly on 2026-08-22, not
inferred from dev. Dev and production differ in ways that matter here, and every
number below came from production.

Nothing in this document has been done. No migration has run against production
and no switch has been flipped.

---

## Before anything

**1. Take the `pg_dump`.** This is the moment the risk is highest and it is a
one-liner. Nothing below should happen before it exists and has been checked for
size and restorability.

**2. Answer the three-orders question.** Purchase orders 298, 299 and 303 exist
in production's `orders.orders` and in neither `exchange` table, so the live
application cannot see them. Either three customers are owed something, or they
are test rows to delete. See FOLLOWUPS.md → *FOR JACOB*. Two backfill guards
refuse until this is settled, and they are right to.

```
pnpm --filter @dorado/api audit:guards
```

**3. Confirm the schema check still passes.** This is the one that proves
genesis can build production rather than only an empty database:

```
pnpm --filter @dorado/api verify:genesis:production
```

---

## What production looks like

| | |
|---|---|
| Schemas present | 9 of 16 — missing `products, organizations, metals, spots, media, leads, rates, reviews` |
| Migrations applied | none, ever |
| Column drift | was 50 behind dev; genesis now reconciles it |
| New schemas | already hold rows, some `exchange` has never seen |

Production's new schemas were built directly in January and left. They are not
empty, they are not current, and both facts change how the migration behaves.

---

## Order of operations

Each step is safe to stop after. Nothing later depends on being done in one
sitting.

### 1. `pg_dump`

Not optional and not automatable from here — production credentials are yours.

### 1b. Restore the dump into `test`, and prove it

**`CREATE DATABASE` will refuse before you get this far.** Every database on the
instance has a collation version mismatch — recorded 2.36, actual 2.41, because
the container's glibc was patched underneath them — and `CREATE DATABASE` copies
`template1`, which carries it. One line clears it:

```sql
ALTER DATABASE template1 REFRESH COLLATION VERSION;
```

That updates the recorded version only; `template1` is empty so nothing needs
rebuilding. The same mismatch on `prod` is a real problem rather than a
nuisance and is written up in FOLLOWUPS.md — production has 41 indexes on text
columns whose sort order the OS no longer agrees with. The dump is unaffected
either way, because `pg_dump` reads table data sequentially rather than through
indexes.

The dump from step 1 is also the rehearsal target. Restoring it into a third
database on the same instance gives a copy of production with the same Postgres
version, extensions and settings — which is what makes a rehearsal mean
anything. A local Docker Postgres could be a different minor version and pass
where production would not.

Two things that are easy to get wrong and expensive to discover late:

- **Dump as `dorado` or `postgres`, never `claude_ro`.** A read-only role
  produces a dump that looks complete and silently omits what it could not read.
  Confirmed on this instance: `claude_ro` gets `permission denied for sequence
  purchase_orders_order_number_seq`, and a database restored without sequences
  hands out order numbers that are already in use.
- **No `--no-owner`.** Keeping production's ownership makes `test` a higher
  fidelity target: the migrations run there as the same role they will run as in
  production.

Then prove it rather than assume it:

```
pnpm --filter @dorado/api compare:databases \
  --source DUMP_SOURCE_DATABASE_URL --target TEST_DATABASE_URL
```

Every table in every schema, compared by row count **and** by an md5 over its
contents, plus every sequence. It refuses to run if both URLs resolve to the
same database, because a comparison of something with itself passes perfectly
and proves nothing — and it exits non-zero if it compared no tables at all.

Point the source at `dorado`: `claude_ro` cannot read sequence values, and the
report fills with nulls that are permission errors rather than differences. The
script says so when it sees one, but it is easier not to.

The full runbook, with a verification gate on every step, is the restore
runbook artifact.

### 2. Apply the migrations

```
MIGRATE_ALLOW_DB=prod pnpm --filter @dorado/api migrate
```

The runner refuses any database other than `dev` unless named
explicitly, which is what `MIGRATE_ALLOW_DB` is for. It prints the target
database before doing anything — read that line.

**REHEARSED ON 2026-08-25, AND THE RESULT CHANGES THIS STEP.** A copy of
production was restored into `test` and all 85 migrations run against it. They
apply — exit 0, nothing pending — **and leave nine of eleven table pairs with
zero rows.** Nothing errors. `verify:parity` is the only thing that notices, and
it is clean on dev, so nothing here would have flagged it.

    leads.leads                        233 -> 0      payments.ledger     17 -> 17
    products.bullion                    95 -> 0      tax.sales_tax_rules 88 -> 88
    rates.rates                         16 -> 0
    products.mints_exchange_compat      10 -> 0
    reviews.reviews                      6 -> 0
    metals / media / refiners / carriers 21 -> 0

This paragraph used to say the `-- baseline: 002-049` marker "records those
migrations as applied rather than replaying them, which is correct once `000`
has brought the shape up to date". **That is false, and the rehearsal is how we
know.** `000` brings the *shape* up to date. It does not bring the *data*,
because several baselined migrations populate as well as alter.

`013_split_core_into_feature_schemas` is the one that matters. Production has
`core` with 9 tables and no `leads`, `rates`, `reviews`, `media`, `products`,
`metals`, `spots` or `organizations` schema at all. `000` creates those empty,
`013` would fill them from `core`, the baseline records `013` as done, and they
stay empty. The two pairs that survive are backfilled by migrations *past* the
baseline.

**So do not run this step yet.** It needs the baseline question answered first —
three options are in FOLLOWUPS.md under "the rehearsal says the migrations apply
to production and leave it empty". The likeliest is the model CLAUDE.md already
describes: genesis for schema, backfills for data, with the runner taught that a
baseline covers schema migrations only.

**What the rehearsal also fixed.** Five migrations that would each have stopped
the run partway, with fifty-odd already applied: `057a`, `059a`, `061a`, `061b`
and `077a`. Every one sorts *before* the migration it unblocks, because the
runner stops at the first failure and never reaches a later file. With them in
place the chain runs to completion.

**And what it proved about the runner**, which is worth knowing on the night: it
refuses a database it does not recognise until `MIGRATE_ALLOW_DB` names it; a
failing migration rolls back cleanly and leaves nothing half-built; and
migrations are immutable, checksummed, with `--reconcile` for comment-only
edits.

**Rollback:** restore the dump. Migrations are forward-only by design; there are
no down-migrations and adding them would be a false comfort, because a down for
a backfill cannot know which rows it inserted.

**Expected to fail if step 2 of *Before anything* was skipped.** The order
backfills and `049` will refuse, naming the rows that made `exchange`
non-authoritative. That refusal is the guard working.

### 3. Verify before touching any switch

```
pnpm --filter @dorado/api verify:parity
pnpm --filter @dorado/api diff
pnpm --filter @dorado/api validate:wire
pnpm --filter @dorado/api audit:coverage:prod
```

`diff` runs every migrated read twice, old implementation against new, and
compares the values. It is the gate for promotion, per-feature.

`validate:wire` is the other half: it parses real responses through the wire
contracts for **both** implementations. `diff` proves the two agree with each
other; `validate:wire` proves the one you are about to promote still matches the
shape the frontend was written against.

That matters most for the three features whose migrated read *renames* columns,
where the alias is the only thing holding the wire shape:

| feature | new schema | wire |
|---|---|---|
| carrier services | `supports_pickups`, `supports_dropoffs`, `max_weight_lb` | `supports_pickup`, `supports_dropoff`, `max_weight_lbs` |
| addresses | `label`, `default_shipping` | `name`, `is_default` |
| media | `checksum` | `checksum_sha256` |

Each alias looks like a typo worth tidying and is not. Dropping the carrier one
renders every toggle in the admin drawer as off without erroring, because they
are bound with `!!service.supports_pickup`. All three are now covered for both
implementations, and each was verified by removing the alias and watching the
check fail.

### 4. Promote features one at a time

Set the environment variable in Railway, redeploy, watch. One per deploy — a
switch flipped alongside three others tells you nothing when something breaks.

---

## The switches

There are two independent axes and conflating them is the mistake to avoid.

- **`*_SOURCE`** — which schema the data is read from and written to.
  Twenty-one of them. All default to `exchange`. None has been changed.
- **`*_WIRE`** — which *shape* the data leaves the API in. Seven of them. All
  default to `legacy`. None has been changed.

A feature can be on `dual` and `legacy`, or on `exchange` and `next`. The first
axis moves when the data is ready; the second moves when the frontend is. They
are deliberately not one switch, because "the new schema is serving reads" and
"the frontend understands the new shape" become true at different times and
each has to be reversible without the other.

### Read-only features — `exchange` → `next`

These expose no writes at all, so `next` carries no risk of divergence: there is
nothing to write to the old schema that the new one would miss.

| Switch | Reads that move |
|---|---|
| `MINTS_SOURCE` | `getAllMints` |
| `REFINERS_SOURCE` | `getAllRefiners`, `getRefinerFromId` |

**Rollback:** set back to `exchange`, redeploy. Instant and total — no writes
happened anywhere new.

### Everything else — `exchange` → `dual`

`dual` moves **reads** to the new schema and sends **writes to both**, in one
transaction. `exchange` keeps receiving everything, which is what makes the step
reversible.

| Switch | Feature |
|---|---|
| `LEADS_SOURCE` | leads |
| `RATES_SOURCE` | rates |
| `REVIEWS_SOURCE` | reviews |
| `SALES_TAX_SOURCE` | sales tax |
| `SPOTS_SOURCE` | spots and metals |
| `MEDIA_SOURCE` | images |
| `PRODUCTS_SOURCE` | bullion products |
| `ADDRESSES_SOURCE` | addresses |
| `PURCHASE_ORDERS_SOURCE` | purchase orders |
| `SALES_ORDERS_SOURCE` | sales orders |
| `CARRIERS_SOURCE` | carriers |
| `SERVICES_SOURCE` | carrier services |
| `PICKUPS_SOURCE` | carrier pickups |
| `SHIPPING_SHIPMENTS_SOURCE` | shipments |
| `SHIPPING_TRACKING_SOURCE` | tracking events |
| `TRANSACTIONS_SOURCE` | the customer credit ledger |
| `CHECKOUT_SOURCE` | the cart, which is a checkout session |
| `USERS_SOURCE` | users |
| `PAYMENTS_SOURCE` | Stripe intents, attempts and settlements |

**Rollback:** set back to `exchange`, redeploy. Safe because `exchange` never
stopped being written to. Rows written to the new schema while `dual` was on are
left behind, harmlessly — they will be rewritten the next time the mirror runs
for that entity.

**There is deliberately no `next` state for any of these.** Writing only to the
new schema is the one-way door: `exchange` stops receiving writes, and flipping
back loses everything written in between. `shared/db/source-switches.test.js`
fails the build if a switch ever offers both `dual` and `next`.

---

## The wire switches

`*_WIRE=legacy` (the default) is the shape the frontend reads today.
`*_WIRE=next` is the honest shape the repos actually return. The adapter is
mounted as one line of middleware per feature — `router.use(wireShape(...))` —
so removing it is deleting that line, not editing every handler.

**Flip one of these only after the frontend for that feature has been changed to
read the new shape.** Unlike `*_SOURCE`, this has nothing to do with the
database and everything to do with what is deployed at `FRONTEND_URL`.
Rollback is instant and total in both directions: no data is written differently.

| Switch | What changes in the response |
|---|---|
| `PRODUCTS_WIRE` | field names only |
| `MEDIA_WIRE` | field names only |
| `SPOTS_WIRE` | field names only |
| `REFINERS_WIRE` | the organization becomes its own object; `is_active` → `enabled` |
| `CARRIERS_WIRE` | the same, for carriers |
| `ADDRESSES_WIRE` | the postal address separates from the person's relationship to it (`user_address`) |
| `PAYMENTS_WIRE` | `attempt` and `details` become their own objects; amounts move from cents to dollars |

`PAYMENTS_WIRE` is the one with a unit change in it. exchange stores money in
**cents** because that table was written straight from Stripe's objects; the new
schema stores **dollars** like everything else. The adapter multiplies by 100 on
the way down, and a frontend reading `next` must divide. Nothing else on this
list changes a value, only names and nesting.

---

## Per-feature notes

Things that are specifically true of one feature and would be surprising.

### `SERVICES_SOURCE` — the ids change

`exchange.carrier_services` and `shipping.services` disagree about ids by
construction. Promoting means the admin services table shows a different set of
uuids.

Nothing stores a carrier service id — there is no foreign key to
`exchange.carrier_services.id` in dev or production — so nothing breaks. But a
browser holding a stale list would send ids the new table does not have, and
`getById` would return `null` until the page refetches. Worth a hard refresh
after this one, and worth not doing it while someone is mid-edit in the drawer.

Deleting a service also becomes stricter: `shipping.shipments.carrier_service_id`
has a foreign key with no `ON DELETE`, so removing a service that shipments still
reference is refused. `exchange` allowed it. That endpoint has never worked
anyway — the controller passed the whole request body where the repo wanted an
id — so there is no prior behaviour being changed.

### `TRANSACTIONS_SOURCE` — the target did not exist until August 2026

Every other switch moves data into a table January already built. This one moves
it into `payments.ledger`, created by migration 060, because
`exchange.account_transactions` had no target at all — no feature declared it,
so every audit walked past seventeen production rows totalling $66,999.32.

Two consequences when promoting it:

- **`payments.ledger` is empty in production until 061 runs.** It is not a
  January table, so unlike `orders.*` or `refiners.*` there is no residue to
  reconcile and no guard that will refuse. Confirm 060 and 061 both applied
  before flipping anything.
- **`addFunds` and `removeFunds` are unaffected by this switch.** The balance
  itself is `exchange.users.dorado_funds` and stays there in every state; 056's
  trigger mirrors it to `auth.users`. Only the ledger entries move. If the
  balance ever needs to move, that is `USERS_SOURCE`, not this one.

The order reference is dropped rather than the entry when an order is not itself
in the new schema — the foreign key would refuse the row otherwise. One
production entry already has no order at all, because `exchange`'s foreign keys
are `ON DELETE SET NULL` and it outlived the order it explained.

### `PAYMENTS_SOURCE` — the new schema disagrees with production, and it is right

The two implementations differ on two fields and neither is a migration bug.

`exchange.payment_intents.payment_status` and `.amount_received` are written by
the Stripe webhook, and the webhook is not reliably landing. Three production
intents were paid and exchange has no record of the money — $51.78, $64.70 and
$10.00, $126.48 in total, all three still saying `requires_payment_method`. The
new schema derives both from the Stripe export (migration 074), so it knows.

Promoting therefore **changes what the admin sales-order drawer shows** for those
three: a status of `succeeded` where it currently says `requires_payment_method`.
That is the correct value, and it will look like a change caused by the flip.

It also fixes a live bug: `retrievePaymentIntent` offers an unresolved intent
back so a customer can resume a checkout, and those three are currently offered
despite being paid. Stripe refuses to confirm an already-succeeded intent, so the
symptom is a checkout that fails at the last step, not a double charge.

`pnpm --filter @dorado/api audit:payments` prints the list. Worth checking the
Stripe dashboard's webhook delivery log before or after — the flip stops the
symptom, it does not fix whatever is dropping the webhook.

### `REFINERS_SOURCE` — it used to be called `SUPPLIERS_SOURCE`

Renamed with the module, in August 2026. Nothing had ever set it, so there is no
old value to carry over — but if you have a note anywhere saying
`SUPPLIERS_SOURCE`, it is this. The HTTP route is still `/api/suppliers`,
because the frontend calls it.

### `ORDERS_SOURCE` — the new schema has no order-number sequence

`orders.orders.number` has a `UNIQUE (direction, number)` and no default. Both
sequences — `exchange.purchase_orders_order_number_seq` and its sales twin —
live in `exchange`, and January never created replacements.

That is fine while `exchange` is authoritative: the two schemas share one
numbering space, and the new creation path draws from `exchange`'s sequence
precisely so they cannot collide.

**It stops being fine at promotion.** Before `ORDERS_SOURCE` moves past `dual`,
the new schema needs its own sequences, seeded from `max(number) + 1` per
direction and owned by `orders.orders.number`. Deliberately not written yet:
seeding it today fixes a starting point that keeps moving every time an order is
placed.

### `PICKUPS_SOURCE` — nothing to compare

Both tables are empty in dev and production, because the write path threw on
every call until it was fixed. `diff pickups` compares two empty sets and proves
only that neither implementation errors. Promote it when a real pickup has been
recorded and checked, not before.

### `ADDRESSES_SOURCE` — the 60 extra rows are snapshots, not duplicates

`places.addresses` holds 118 rows against `exchange`'s 72, and 60 have no
counterpart in `exchange`. **Do not delete them.**

59 are order address snapshots: `orders.addresses` has exactly 59 rows and every
one points at one of these. A snapshot carries the same values under a fresh id
on purpose — it records where an order was actually sent, so that editing or
deleting an address book entry later cannot rewrite history. The 60th is a
`places.locations` row, one of the business's own addresses, and it is on a
shipment.

They match `exchange` rows on `(line_1, city, zip)`, which is what a snapshot
looks like and not what a duplicate looks like. Nothing here needs cleaning up.

### `PURCHASE_ORDERS_SOURCE` / `SALES_ORDERS_SOURCE` — blocked on the three orders

The order backfills refuse while `orders.orders` holds rows `exchange` has no
order for. Settle that first.

### `SHIPPING_SHIPMENTS_SOURCE` — three orphan shipments

Same three orders. All three carry tracking numbers and events.

---

## Not ready

**`payments`** — the new schema is a different model, production already holds 70
placeholder intents, and `exchange.payment_intents` is demonstrably wrong: seven
of eight settled payments are not recorded as succeeded. `payments.stripe_charges`
now holds Stripe's version, but deriving `intents`/`attempts`/`settlements` from
it means replacing those 70 rows, which is a decision about money.
`payments.details` holds fourteen plaintext bank details in production and must
not be copied until the encryption question is answered.

**`auth`** — better-auth writes `exchange.users`, `session`, `account` and
`verification` through its own pool, bypassing every repo. There is no write path
to split, so there is no `dual` state to pass through: migrating means changing
four `modelName` strings and cutting live authentication over atomically. If it
is wrong, nobody can log in, including whoever needs to fix it. The one idea that
would make it reversible is pointing better-auth at updatable views over
`exchange`, so reverting is a view definition rather than a deploy.

---

## If something goes wrong

**A switch is misbehaving.** Set it back to `exchange` and redeploy. That is the
whole rollback for every feature in the `dual` list. Do this first and diagnose
after — `exchange` has every row.

**A migration failed partway.** It did not. Each migration runs inside its own
transaction, so a failure leaves the database exactly as it was. Read the error;
it names what refused.

**A backfill refused.** Read the message — it names the table and the reason.
This means the new schema holds something `exchange` does not, and re-running
would overwrite it. Do not force it.

**Something is actually lost.** Restore the dump from step 1. This is the only
scenario it exists for, and it is why nothing above happens before it is taken.
