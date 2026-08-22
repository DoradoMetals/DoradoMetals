# Follow-ups

Things found and deliberately deferred, with enough context to pick up cold.
Ordered roughly by how much they'd cost if left.

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
