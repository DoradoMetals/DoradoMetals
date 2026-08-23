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

### 2. Apply the migrations

```
MIGRATE_ALLOW_DB=dorado_db pnpm --filter @dorado/api migrate
```

The runner refuses any database other than `dorado_db_dev` unless named
explicitly, which is what `MIGRATE_ALLOW_DB` is for. It prints the target
database before doing anything — read that line.

What happens: `000` creates the seven missing schemas, and reconciles the nine
existing ones with `ADD COLUMN IF NOT EXISTS` (532 of them). Its
`-- baseline: 002-049` marker records those migrations as applied rather than
replaying them, which is correct once `000` has brought the shape up to date.
Then `050` onward run normally.

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
shape the frontend was written against. Three carrier-service fields are
aliases that exist only to hold that shape, and dropping one would render every
toggle in the admin drawer as off without erroring.

### 4. Promote features one at a time

Set the environment variable in Railway, redeploy, watch. One per deploy — a
switch flipped alongside three others tells you nothing when something breaks.

---

## The switches

All seventeen default to `exchange`. None has been changed.

### Read-only features — `exchange` → `next`

These expose no writes at all, so `next` carries no risk of divergence: there is
nothing to write to the old schema that the new one would miss.

| Switch | Reads that move |
|---|---|
| `MINTS_SOURCE` | `getAllMints` |
| `SUPPLIERS_SOURCE` | `getAllSuppliers`, `getSupplierFromId` |

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

**Rollback:** set back to `exchange`, redeploy. Safe because `exchange` never
stopped being written to. Rows written to the new schema while `dual` was on are
left behind, harmlessly — they will be rewritten the next time the mirror runs
for that entity.

**There is deliberately no `next` state for any of these.** Writing only to the
new schema is the one-way door: `exchange` stops receiving writes, and flipping
back loses everything written in between. `shared/db/source-switches.test.js`
fails the build if a switch ever offers both `dual` and `next`.

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

### `PICKUPS_SOURCE` — nothing to compare

Both tables are empty in dev and production, because the write path threw on
every call until it was fixed. `diff pickups` compares two empty sets and proves
only that neither implementation errors. Promote it when a real pickup has been
recorded and checked, not before.

### `ADDRESSES_SOURCE` — production has 60 orphan rows

`places.addresses` holds 118 rows against `exchange`'s 72, and 60 of them have
no counterpart. They are re-keyed duplicates rather than lost data — 59 of the
60 match an `exchange` row on `(line_1, city, zip)` — created by the January work
copying addresses with fresh ids. None is linked to a user. They are junk to
clean up deliberately after promotion, not a blocker for it.

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
