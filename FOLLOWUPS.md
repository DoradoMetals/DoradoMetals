# Follow-ups

Things found and deliberately deferred, with enough context to pick up cold.
Ordered roughly by how much they'd cost if left.

## The migration chain can now run on production, but the tables arrive empty

The structural half of this is fixed. `000_genesis_schema.sql` creates all 16
schemas, 45 tables, 4 views, 4 enum types and 1 function from nothing, and is
verified by `pnpm --filter @dorado/api verify:genesis`, which builds the whole
thing under renamed schemas inside a rolled-back transaction and compares it
column by column, constraint by constraint, against dev.

It is generated, not hand-written - `pnpm --filter @dorado/api dump:schema`
regenerates it from the dev catalog. Edit the generator, not the SQL.

**What is still missing is the data.** Genesis creates empty tables. On
production the new schema will exist and hold nothing, and the per-feature
backfills (003, 010, 025, 028) are all inside the baseline range, so they are
recorded rather than run. Nothing populates the new tables from exchange.

That backfill is the remaining work, and it is the harder half: it is the same
transformation the per-feature migrations have been doing one at a time -
splitting suppliers and carriers into organizations, moving mint descriptions,
renaming product columns, flattening scrap into order items - expressed once,
as a single ordered pass over exchange. It must be idempotent, and it must be
safe to run while `*_SOURCE` switches are still on `exchange`.

Note the ordering constraint: the backfill can only run *before* any switch is
promoted past `dual`. Afterwards the new schema holds rows exchange does not,
and a backfill would overwrite them. `verify:parity` already refuses in that
state; the backfill must too.

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

### Bank details are unencrypted at rest

`exchange.payouts.routing_number` and `.account_number` are plaintext `text`,
written straight from `req.body` by `insertPayout`. Order responses no longer
carry them — only last-4, with full values behind an admin-only endpoint — but
the storage is unchanged.

Deferred by Jacob. Worth checking whether prod actually holds any: if ACH and
Wire have never been used, these columns are vestigial and the answer is to drop
them rather than build encryption.

```sql
SELECT method, count(*), count(routing_number), count(account_number)
FROM exchange.payouts GROUP BY method;
```

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
