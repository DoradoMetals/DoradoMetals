# Follow-ups

Things found and deliberately deferred, with enough context to pick up cold.
Ordered roughly by how much they'd cost if left.

## Production: the schema and eleven features' data can now get there

`000_genesis_schema.sql` creates all 16 schemas, 45 tables, 4 views, 4 enum
types and 1 function from nothing. `029_genesis_backfill.sql` fills the tables
belonging to the eleven migrated features from exchange.

Both are verified by building into renamed schemas inside a rolled-back
transaction: `verify:genesis` compares the structure against dev column by
column, `verify:backfill` runs the backfill into empty tables and compares the
rows, re-runs it to prove idempotency, and checks that it refuses once the new
schema holds a row exchange does not.

Genesis is generated - `pnpm --filter @dorado/api dump:schema`. Edit the
generator, never the SQL.

### What is still not populated

**The other features' tables.** orders, payments, fulfillments,
shipping.shipments/tracking/pickups, places, and the refiners item/spot tables.
Their features still read exchange so empty costs nothing, but each needs
transformation work checked against a read-for-read diff first. They should be
backfilled as each feature is migrated, not in a batch.

**The seed data, which has no source in exchange at all.** These are new facts
about the business rather than a reshaping of old ones, so they cannot be
derived and must be written as literals:

- the DORADO organization (the business itself) and `places.locations` /
  `places.location_hours`, which reference it
- `fulfillments.methods` (11 rows), `payments.methods` (10)
- `shipping.services` (8) and `shipping.packages` (9) - also blocked on the
  product decision below
- `auth.employees` (2)

Worth doing as one seed migration, taking the values from dev. Until then a
production database would have the tables and none of these rows.

### BLOCKED: payments is a different model, not a reshaped one

Audited. The new payments schema is not a copy of exchange with the columns
rearranged - it is a different design, populated in January with data that does
not correspond to what exchange holds.

- **No id is shared.** None of payments.details, .methods, .intents, .attempts
  or .settlements shares a single id with exchange.payouts or
  exchange.payment_intents.
- **The granularity differs.** exchange.payment_intents holds 21 rows across 8
  distinct orders - several Stripe attempts per order. payments.intents holds
  28, roughly one per order, with attempts and settlements hanging off them
  one to one. Only 2 of the 28 attempts carry a provider_ref matching a real
  Stripe payment_intent_id.
- So the 28 rows are not a reference to copy from. Migrating means designing
  the transformation from scratch - 21 Stripe intents across 8 orders becoming
  intents, attempts and settlements - and then *replacing* what is there, which
  means deleting rows in the new schema. That is a decision, not a mechanical
  step.

The model itself looks better than exchange's: separating what was intended,
what was attempted and what settled is the right shape for payment data. But
the mapping is a design question about money, and the existing rows would have
to go.

payments.methods (10 rows) is seed data with no exchange source, and belongs
with the seed migration below.

### 35 populated columns still have no home, and they are now known in advance

`pnpm --filter @dorado/api audit:coverage` reports, for every source table,
which populated columns have no destination in the schema it maps onto. It was
written because orders turned out to be missing twenty-one columns of live data,
found one repo function at a time, after the row counts had matched and the
shapes looked plausible.

The eleven migrated features are clean. What remains, to be fixed *before* each
feature's repo is split rather than during it:

- **shipping — 13 columns.** `exchange.shipments` has essentially nothing mapped:
  shipping_status, service_type, type, carrier_id, package, pickup_type,
  net_charge, shipping_label, estimated_delivery, created_at and both order id
  columns, all populated. Plus `tracking_events.scan_time`, 72 of 72. The
  shipping tables are the emptiest sketch of the lot.
- **payments — 18 columns.** `payment_intents` is almost entirely unmapped
  (payment_intent_id, payment_status, type, user_id, amounts, and the card and
  bank descriptors), and `payouts` is missing order_id, method,
  account_holder_name and cost.
- **refiners — 4 columns**, the same four added to orders.spots by 035:
  scrap_percentage, bullion_percentage, created_at, updated_at. Migration 035
  already added them to `refiners.spots`; they are listed here because the
  refiners feature has not been backfilled yet, so its table is still empty.

The audit only proves a mapping *exists*, not that it is right. It is a floor.

### When addresses is promoted, orders should return the snapshot id

The order reads return `orders.addresses.source_address_id` - the address-book
row an order was placed against - rather than the snapshot's id, because the
frontend posts it back at checkout and `getAddressFromId` resolved it against
`exchange.addresses`. Tests in both order features pin that.

Under `ADDRESSES_SOURCE=dual` that still works, and not by luck: the address
book kept its exchange ids, so the same id resolves in `places.addresses`. But
once addresses is promoted, the better answer is for the order to return the
*snapshot* id. The snapshot is the address that order was actually sent to,
frozen at the time; the address-book row is whatever the customer has edited it
into since.

Deliberately not done in the same change as the addresses split - it alters
what two order reads return, and those have their own tests. Do it as its own
commit, with the order diffs re-run.

### The order address id is the address-book id, not the snapshot's

`orders.addresses` points at a snapshot in `places.addresses` and also records
`source_address_id`, the address-book row it was copied from. The order read
returns the source id, because the frontend posts `address.id` back at checkout
and the API resolves it with `addressService.getAddressFromId`, which reads
`exchange.addresses`. A snapshot id does not resolve there.

That is right for now and wrong eventually. Once the addresses feature moves and
`getAddressFromId` reads `places.addresses`, the snapshot id should become the
one returned - it is the address the order was actually placed against, frozen.
Revisit when places is migrated; there is a test pinning the current behaviour.

### shipping_service now exists twice, and may want to exist once

`orders.transactions.shipping_service` was added by 041 because the sales order
read returns it and the wire shape may not change. It sits beside the shipping
cost, which is where exchange kept it.

`shipping.shipments.service_type` holds what looks like the same thing. Whether
they are one field is still open and still tangled up with the
`shipping.services` question below - `exchange.shipments.service_type` contains
values `carrier_services` does not.

If the shipping migration concludes they are the same, this is the column to
drop. That was the deliberate choice: dropping a duplicate later is a much
easier conversation than recovering a column that was never carried across.

### BLOCKED: fulfillments is blocked behind shipping, exactly

A fulfillment is derived from a shipment, and the dependency is one-to-one:

- all 17 orders that have a fulfillment have a shipment in `exchange`
- the 6 orders that have a shipment but *no* fulfillment are precisely the 6
  whose shipments were never copied into `shipping.shipments`
- all 16 `fulfillments.shipments` links resolve, because they can only point at
  shipments that were copied

So the missing fulfillments are not a separate gap; they are the shipping gap
seen from the other side, and they close when shipping does.

The method mapping is clean and worth recording: `exchange.shipments.pickup_type`
'Store Dropoff' becomes CARRIER DROPOFF, 'DropShip' becomes DROPSHIP.

One row needs its own look: there are 17 fulfillments and 16 shipment links, and
the odd one has method APPOINTMENT — but `fulfillments.directs` and
`fulfillments.pickups` are both empty, so nothing backs it.

### BLOCKED: auth cannot be dual-written, because better-auth owns the writes

`features/auth/client.js` configures better-auth with
`modelName: 'exchange.users'`, `'exchange.session'`, `'exchange.account'` and
`'exchange.verification'`, and better-auth writes those tables through its own
pool - not through `#db`, not through the shared executor, not through any repo.

So there is no dual-write to build. Migrating auth means changing those four
`modelName` values, which is an atomic cutover of live authentication with no
reversible middle state. Everything else in this migration goes through `dual`
precisely to avoid that shape of change; auth cannot.

Worth noting separately: better-auth's pool bypasses the NUMERIC and INT8 type
parsers registered in `api/db.js`, so anything it reads comes back with
different types than the rest of the codebase would give.

`auth.users` is already backfilled by 029 and `auth.employees` by the seed, so
the data is there whenever the cutover happens. The 2 sessions and 2 accounts
the new schema has that exchange does not belong to test users created directly
in January.

### BLOCKED: refiners needs the same answer as a purchase order's refiner

`refiners.spots` (124 rows) and `refiners.items` (40) both carry a NOT NULL
`refiner_id`, and every row in both points at Elemetal.
`exchange.refiner_metals` and `exchange.purchase_order_items` have no refiner
column at all, so there is nothing to derive it from - it is the same fact
someone knew in January that `orders.orders.refinery_id` needs, and the same
decision answers both.

Unlike the orders case, null is not an option here: the column is NOT NULL, so
a backfill must assert *some* refiner for every row.

The columns are otherwise fine - `audit:coverage refiners` is clean, since
migration 035 added the four it was missing. It is only the identity that is
unknown.

Moving refiners also means giving it its own feature folder: its five repo
functions currently live in `features/purchase-orders/`, which is exactly the
mixing that should not happen.

### A purchase order's refiner is not recorded in exchange

`orders.orders.refinery_id` is set on all sixteen purchase orders in dev, all to
Elemetal. `exchange.purchase_orders` has no supplier column, and
`exchange.refiner_metals` has none either, so there is nothing to derive it
from - it is a fact someone knew in January and wrote down.

The backfill leaves it null for purchases rather than asserting Elemetal of
every purchase order on production because it happened to be true of sixteen in
dev. Sales orders are fine: they carry `supplier_id` and it maps straight
across.

Needs a decision. If every purchase order really does go to one refiner, say so
and the backfill can set it; if not, it is only recoverable from whatever
records exist outside the database.

### reviews.user_id cannot be reconstructed

`exchange.reviews` records a name and no user reference. dev's `reviews.user_id`
was filled in January by matching that name, but exchange.users now holds two
accounts named Jacob Johnson and every review in dev is under that name, so the
match is ambiguous and the backfill leaves it null rather than guessing. If the
link matters, it needs a deliberate decision about which account is the
reviewer - it is not recoverable from the data.

## Security

### The audit trail is forgeable — and the fix is server-only

The frontend sends `user_name: user?.name` in the request body, and the API
writes it to `created_by` / `updated_by` verbatim. Any authenticated admin can
attribute an action to anyone by editing one field.

`req.user.id` and `req.user.name` are already available from `requireAuth` and
are used for audit in **zero** places.

**No frontend change is needed.** The server keeps accepting the field and
simply stops trusting it — read the actor from the session instead. The
frontend can go on sending `user_name`; it just gets ignored. 53 call sites
across 23 API files pass `user_name` today.

Until this is done, the new `created_by_id` columns are a trustworthy column
filled from an untrusted source.

### Bank details are unencrypted at rest - and in dev, there are none

`exchange.payouts.routing_number` and `.account_number` are plaintext `text`,
written straight from `req.body` by `insertPayout`. Order responses carry only
last-4, with full values behind an admin-only endpoint, but the storage is
unchanged.

**In dev, both columns are null on all 16 rows.** Every payout is either ECHECK
(10) or DORADO_ACCOUNT (6) - neither of which involves ACH or wire details.
`payments.details` in the new schema likewise holds no routing or account
number on any of its 16 rows.

If production looks the same, the answer is to drop the columns rather than
build encryption, which is the cheaper and safer fix by a wide margin. That
cannot be concluded from dev - dev holds tens of rows and proves nothing about
production - so it needs the query below run against prod, which is blocked on
the `claude_ro` role failing authentication.

```sql
SELECT method, count(*), count(routing_number), count(account_number)
FROM exchange.payouts GROUP BY method;
```

If production *does* hold real bank details, the migration must not copy them:
that would put the same plaintext secrets in two places and double the
exposure. Either way this is a decision to take before payments moves.

## Schema

### The API doesn't populate the new audit id columns

`created_by_id` / `updated_by_id` exist on 14 new-schema tables and are
backfilled, but dual-write only mirrors the text columns, so new rows get null.
Ties into the session-actor fix above — do them together.

### Latent defects in `exchange`, not worth fixing there

Recorded because the same mistakes should not be carried into the new schema:

- `exchange.addresses.state` defaults to `'United States'`; `country` has no
  default. The pair is transposed. No rows affected — the app always supplies
  both — and `places.addresses` already has it the right way round.
- `exchange.leads.contact` defaults to the literal `'Jacob Johnson'`.
- `order_metals.percent_change` and `dollar_change` are 100% NULL but still
  selected by `findMetalsByOrderId`. `scrap.gem_id` is 100% NULL but still
  inserted by `insertScrapFromCartItem`. Do not drop without changing the code
  first.
- Naive timestamps throughout. Correct only because the container runs UTC,
  which is now pinned explicitly in both Dockerfiles rather than assumed.

### `NOT NULL` constraints are unassessed

Dev holds tens of rows, so dev null counts prove nothing. Needs
`pnpm --filter @dorado/api audit:nullability` against production. Blocked on the
`claude_ro` role, which fails authentication on every database on that instance
— `ALTER ROLE claude_ro PASSWORD '<the one in api/.env>';`

### Dead schema, unconfirmed

`auctions` and `auction_items` tables remain after the auction code was removed
in `19c7a532`. They hold data (1 and 10 rows in dev) and nothing references
them. Needs a yes/no before dropping, and a `pg_dump` first.

### The January copy dropped rows, and the count is not zero

Two gaps found while auditing orders, both closed by migration 028:

- one `purchase_order_item` (order 239, Received) never reached `orders.items`
- two purchase orders (241 and 242, both In Transit) carried an `address_id`
  that never became an `orders.addresses` row

Neither was visible from the schema - only from counting rows against the
source. Nothing was lost from `exchange`; the target was short. The lesson for
the remaining features is that shape parity is not row parity, and the copy
should be assumed incomplete until counted. The genesis backfill above makes
this moot for production, which will be populated from exchange directly rather
than inheriting January's copy.

### products.bullion.quantity left nullable

exchange.products declares `quantity` NOT NULL; `products.bullion` leaves it
nullable and migration 024 did not tighten it, unlike supplier_id, image_front,
image_back and stock which it did.

The others are restorations — nothing treats them as optional and a product
without a front image cannot render. `quantity` is a judgement: a
not-yet-stocked product could reasonably lack one, and exchange's NOT NULL may
be incidental rather than intended. Worth a decision rather than a default.

### Empty-string emails on carrier organizations

Two CARRIER rows in `organizations.organizations` hold `''` rather than NULL for
email. Postgres treats every NULL as distinct for uniqueness but two empty
strings as equal, so the placeholder actively defeats a constraint that would
otherwise be free. Found while scoping the refiner uniqueness in migration 020;
left alone because those rows belong to the shipping migration.

### BLOCKED: shipping.shipments is blocked behind services, and its copy is short

Audited in full. The structure is right and the copy is not.

**Which table is authoritative.** `shipping.shipments` and
`fulfillments.shipments` both exist and both hold rows, which looks like two
rival copies and is not. `shipping.shipments` keeps exchange's ids - all 17 of
them - and is the shipment. `fulfillments.shipments` shares no ids with
exchange at all; it is a link table joining a fulfillment to a shipment, with
the pickup and delivery locations. A shipment no longer points at its order
either: `fulfillments.fulfillments` does, one row per order.

**Seven of the thirteen reported gaps were renames** nobody had recorded -
est_delivery, label, cost, direction, tracking's `time`, and the two order id
columns being relocated rather than lost. All are now declared in
`scripts/audit-coverage.mjs`, verified against the data.

**Three real gaps are closed** by migration 046: shipping_status, pickup_type
and created_at, all populated on 23 of 23 rows.

**Three are blocked**, and they are what stops the feature:
`service_type`, `package` and `carrier_id` all route through
`shipping.services` and `shipping.packages`, which need the two decisions
below. `audit:coverage shipping` now prints them as BLOCKED rather than as
plain gaps.

**The copy is also incomplete, independently of the decisions:**

- 6 of exchange's 23 shipments were never copied (5 Inbound, 1 Outbound)
- the 6 tracking events missing from `shipping.tracking` all belong to those
  same 6 shipments, so it is one gap rather than two
- `shipping.tracking` holds **9 rows that do not exist in exchange at all** and
  are not duplicates of anything there. Where they came from is unknown. They
  must be understood before any backfill, because the guard that protects every
  other backfill reads exactly this condition as "exchange is no longer
  authoritative"
- 3 shipments have `cost = 0` where exchange has `net_charge = NULL` - the same
  null-defaulted-to-zero mistake found on orders.items.quantity

None of that is destructive - exchange holds all 23 - but the target cannot be
switched to until it is repaired, and repairing it is only worth doing once the
service and package questions are answered, since those change what a shipment
row is.

### BLOCKED: shipping.services needs a product decision before it can move

`shipping.services` is not a copy of `exchange.carrier_services` — it is a
correction of it, and migrating either way changes what the API returns.

What the data says:

- `exchange.carrier_services` holds **2** rows: Express Saver and Overnight,
  both FedEx.
- `exchange.shipments.service_type` stores the service *name as text*, and the
  values in use are Express Saver (16), **Standard** (6) and **Free** (1) —
  two of which do not exist in `carrier_services` at all.
- `shipping.services` holds **8**: Free, Overnight, Standard per carrier for
  FedEx and UPS, plus Express Saver and Priority Overnight for FedEx. The
  apparent duplicates are per-carrier, which is correct.
- The frontend hardcodes both spellings: `salesOrders/types.ts` uses
  `'Overnight'`, `service/types.ts` uses `serviceDescription: 'Priority
  Overnight'`.

So the old table was never the source of truth — the real service list lives in
the frontend, and `carrier_services` drifted into holding a fragment of it.

**Two decisions needed:**

1. Should `GET /carrier_services` start returning 8 rows instead of 2? It is
   additive and arguably a fix, but it is a visible change to whatever lists
   services.
2. The id `2fb26257-65a3-4922-98d2-a9726a9b5167` is named `Overnight` in
   exchange and `Priority Overnight` in shipping. Same row, two names. Which is
   correct? FedEx's actual product is Priority Overnight, so the new name looks
   right — but `exchange.shipments.service_type` matches on the name, so
   renaming affects how existing shipments resolve.

Until both are answered, migrating services would either discard the more
complete list or silently change displayed service names. `shipping.packages` is
fed from the same source and is blocked behind the same questions.

## Operations

### No production backup has been taken

The agreed plan is a manual `pg_dump` before the **first** production migration
run. That has not happened yet, and nothing has been applied to production.

### Docker images have never been built

No Docker daemon in the dev environment. Both Dockerfiles have been rewritten
for the workspace and moved to Node 24 without a single `docker build`. Worth
running once locally before the next deploy:

```
docker build -f api/Dockerfile .
docker build -f frontend/Dockerfile .
```

### Railway settings

Root Directory `/` on both services, `RAILWAY_DOCKERFILE_PATH` of
`api/Dockerfile` and `frontend/Dockerfile`, Watch Paths per service. Confirmed
done. "Wait for CI" should be enabled once the workflow has run on master.

## Testing

- The frontend has **no tests at all** — 42k lines, zero.
- Repo tests exist only for `leads`. ~150 other repo functions are untested.
- Nothing tests routes, middleware or auth end to end.
