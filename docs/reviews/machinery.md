# machinery review

Area: `api/src/db/**` (repos + every SQL file), `api/src/shared/**`,
`app.ts` / `server.ts` / `env.ts` / `pool.ts` / `domains/index.ts`,
`api/migrations/13*.sql` + `000_genesis_schema.sql` for constraints the code
assumes, and `api/scripts/*` where a script can write.

Everything below was reproduced against the LOCAL cluster on 127.0.0.1:5544
(`test`, and `test_review_lane` which the preflight created from it for this
branch and migrated to 133). Nothing was run against dev, prod, or
`PROD_READONLY_DATABASE_URL`. No code was changed; the one probe test written
to reproduce F1 was deleted and the worktree is clean.

## Findings (most severe first)

### F1 `GET /api/shipments/:id` — a `?shipment_id=` of your own unlocks anyone else's shipment [severity: authz]

- where: `api/src/shared/middleware/ownership.ts:88-93`;
  route `api/src/domains/logistics/shipping/shipments/routes.ts:13`;
  handler `api/src/domains/logistics/shipping/shipments/controller.ts:18-25`
- proof: the guard resolves the subject as

  ```ts
  const shipmentId =
    req.body?.shipment_id ??
    req.query?.shipment_id ??
    (Array.isArray(rawParam) ? rawParam[0] : rawParam) ??
    null
  ```

  so `req.query.shipment_id` **outranks** `req.params.id`. The handler it
  guards reads `uuidParam(req, 'id')` — the path param. The two disagree
  whenever the caller supplies the query string.

  Reproduced with supertest against `test_review_lane` (two users, two orders,
  two shipments, attacker signed in as the second):

  ```
  PROBE plain status = 403
  PROBE with query shipment_id status = 200
  PROBE body = {"shipment":{"id":"99fff762-1188-490d-884d-1d0b03d856bd", ...
                "tracking_number":"794161578f00", "declared_value":2500, "cost":24...
  PROBE victim= 99fff762-1188-490d-884d-1d0b03d856bd   attacker= 7a0b2668-f2db-...
  ```

  `GET /api/shipments/<victim>` alone is correctly 403. `GET
  /api/shipments/<victim>?shipment_id=<mine>` returns **200 and the victim's
  shipment** — id, tracking number, declared value, cost, label type. A JSON
  body works the same way, because `express.json()` parses a GET body too.
  The existing test `operations/tests/shipment-ownership.test.ts` never
  exercises the param route, only `POST /api/shipping/get_tracking` (which is
  safe: its handler reads `body.shipment_id`, the same source the guard
  prefers).
- fix: a guard must read the subject from the same place its handler does. For
  a `:id` route resolve `req.params` only; the body/query fallback belongs to a
  separate `requireOwnShipmentBody` used by `POST /api/shipping/get_tracking`.
  `ownership.ts` is the file.

### F2 one anonymous visitor with a payment intent stops the anonymous sweep for ever [severity: data]

- where: `api/src/db/users/anonymous/sql/delete.sql`;
  `api/src/db/users/anonymous/sql/list_stale.sql`;
  `api/src/domains/checkout/sweep.ts:20-26`
- proof: `delete.sql` clears exactly four dependants — `checkout.checkouts`,
  `places.user_addresses`, `auth.sessions`, `auth.account` — then deletes
  `auth.users`. Seven other `NOT NULL`-able FKs onto `auth.users(id)` carry
  `ON DELETE NO ACTION` and are not cleared: `payments.intents.user_id`,
  `payments.details.user_id`, `payments.ledger.user_id`,
  `orders.orders.user_id`, `media.images.user_id`, `media.emails.user_id`,
  `reviews.reviews.user_id` (catalogue query against `test_review_lane`).
  `list_stale.sql` selects a visitor on recency alone and excludes none of
  them.

  Run against `test_review_lane` inside a rolled-back transaction — two stale
  visitors, one of them holding a `payments.intents` row, then `delete.sql`
  verbatim:

  ```
  ERROR:  update or delete on table "users" violates foreign key constraint
          "intents_user_fk" on table "intents"
  DETAIL:  Key (id)=(1111...1111) is still referenced from table "intents".
  ```

  The delete is ONE statement over the whole batch (`BATCH = 5_000`) inside one
  `withTransaction`, so the innocent second visitor is not deleted either.
  `list_stale` is `ORDER BY last_seen LIMIT $2`, so the blocker is always in
  the first batch: every subsequent tick picks it up again and fails again.
  The only symptom is a `reportError` line; the sweep silently stops working
  permanently.

  Reachability: `fillMissingRole` (`domains/accounts/auth/anonymous.ts:3-10`)
  gives a visitor `role: 'user'`, and `/api/stripe/retrieve_payment_intent` is
  guarded by `requireUser` (`domains/transactions/routes.ts:13`), whose
  `recordIntent` writes `payments.intents.user_id = <visitor id>`
  (`domains/transactions/service.ts:104-112`). I proved the database half; I
  did not drive the Stripe call end to end (the suite blocks network).
- fix: either widen `delete.sql`'s CTE chain to every table that references
  `auth.users`, or — better — have `list_stale.sql` refuse a visitor that any
  of those tables still references, so a visitor who got as far as an intent or
  an order is simply never a candidate. Delete per-victim rather than
  per-batch so one bad row cannot stop the rest.

### F3 `organizations.update` writes NULL over every field the caller did not send [severity: data]

- where: `api/src/db/organizations/repo.ts:26-45`;
  caller `api/src/domains/logistics/shipping/carriers/service.ts:34-51`
- proof: the repo builds its patch from a fixed literal, coalescing every
  absent field to `null` rather than leaving it out:

  ```ts
  patch: {
    name: row?.name ?? null,
    email: row?.email ?? null,
    phone: row?.phone ?? null,
    enabled: row?.enabled ?? null,
  },
  ```

  `buildUpdate` only skips `undefined`, so all four columns are SET. `CarrierPatch`
  makes `organization` `.optional()` and `OrganizationPatch` is `.partial()`
  (`packages/contracts/src/shipping/carriers.ts:28-34`), so the perfectly valid
  body `{ carrier: { id, logo: "x" } }` reaches
  `organizations.update(orgId, undefined)`.

  `organizations.organizations.name` and `.enabled` are NOT NULL. Reproduced
  against `test` in a rolled-back transaction:

  ```
  ERROR:  null value in column "name" of relation "organizations"
          violates not-null constraint
  ```

  So updating only a carrier's logo raises 23502 → 500, and because it is inside
  `updateCarrier`'s `withTransaction`, the logo write is rolled back too. An
  `organization` object that names `name` but omits `enabled` fails the same
  way; one that names `name` and `enabled` but omits `email`/`phone` succeeds
  and **wipes them silently**. `organizations.create` has the same shape
  (`row?.enabled` → `null` → 23502).
- fix: pass the caller's object through as a real patch — `buildUpdate` already
  distinguishes "absent" (`undefined`, leave alone) from "clear" (explicit
  `null`). Delete the coalescing literal in `db/organizations/repo.ts` and pass
  `row ?? {}`; `create` should let the column defaults apply rather than
  inserting `null`.

### F4 `fineContent` throws on a NULL unit, and silently values an unknown unit at zero [severity: money]

- where: `api/src/shared/utils/convertWeights.ts:1-29`; call sites
  `domains/orders/rules.ts:45`, `domains/orders/service.ts:102`,
  `domains/checkout/rules.ts:38`,
  `domains/orders/refiners/items/service.ts:33`
- proof: `convertTroyOz(num, unit)` reaches `unit.toLowerCase()` without a null
  check (`isNaN(null)` is false, so the guard above it does not fire), and its
  `default:` arm returns `0`. Run directly:

  ```
  fineContent(10, null, 0.9) THREW: TypeError Cannot read properties of null (reading 'toLowerCase')
  fineContent(10,'kg',0.9)      = 0
  fineContent(10,'ozt',0.9)     = 0
  fineContent(10,'oz t',0.9)    = 0
  fineContent(10,'troy_oz',0.9) = 0
  fineContent(10,' g ',0.9)     = 0
  ```

  Both halves are reachable. `orders.items.unit` and `checkout.items.unit` are
  **nullable** (information_schema), and `orderItems.create` writes
  `row.unit ?? null` (`db/orders/items/repo.ts:52`), so a line can exist with
  no unit. `updateLine` then computes
  `unit = changes.unit !== undefined ? changes.unit : line.unit`
  and calls `fineContent(weight ?? preMelt, unit, purity)` — every later edit
  of that line is a 500 with no message. `refiners.items` already holds 21 rows
  with a NULL unit in the local test database.

  The zero arm is the money half: an item whose unit is anything but exactly
  `t oz` / `g` / `dwt` / `lb` (case-insensitive, no surrounding whitespace)
  gets `content = 0` **persisted** to `orders.items.content`, and
  `pricing/sql/*.sql` prices off `content`. A customer's parcel is then worth
  $0. Note `rates.rates.unit` uses a different vocabulary entirely
  (`troy_oz`, 16 rows), so the spelling is not universal in this database.
- fix: `convertTroyOz` should refuse rather than return 0 — an unrecognised or
  missing unit is a defect in the row, not a weight of nothing. Raise `Invalid`
  and let the caller answer 422. The one thing it must not do is write a zero
  fine content. `shared/utils/convertWeights.ts` is the file.

### F5 the settled-intents sweep rewrites an order's status with no guard, no lock and no transaction [severity: data]

- where: `api/src/domains/transactions/sweeps.ts:13-21`;
  `api/src/shared/cron/scheduler.ts:28-34`
- proof:

  ```ts
  const candidates = await orders.findSalesAwaitingSettledIntent(executor)
  for (const c of candidates) {
    await orders.update(c.order_id, { status: 'Preparing' }, {}, executor)
  ```

  On the cron path `executor` is `undefined`, so the SELECT and every UPDATE
  are separate autocommitted statements on pooled connections. The candidate
  query filters `o.status = 'Pending'`
  (`db/orders/sql/find_sales_awaiting_settled_intent.sql:6`) but the UPDATE
  carries no such condition — the guard argument is `{}`, and
  `OrderGuard = Order.pick({ status: true, direction: true }).partial()`
  (`packages/contracts/src/orders/orders.ts:148`) supports exactly this. There
  is no `FOR UPDATE` and `find_reserved_funds` / the cancel path take no lock
  either.

  Between the SELECT and the UPDATE the order can be cancelled — by an admin,
  or by `cancelPendingSale`, which sets `Cancelled` and returns the customer's
  reserved credit. The sweep then writes `Preparing` back over it, so a
  refunded order is resurrected into fulfilment. The result of `orders.update`
  is discarded, so nothing observes it. Not reproduced as a live race — the
  window is real but timing-dependent; the missing guard is on the line.
- fix: pass `{ status: 'Pending' }` as the guard so a row that has moved on is
  a no-op, run the loop inside one `withTransaction`, and check the boolean the
  repo already returns. `domains/transactions/sweeps.ts`.

### F6 every cron job runs once at boot, before — and regardless of — its schedule check [severity: data]

- where: `api/src/shared/cron/scheduler.ts:52-67`
- proof:

  ```ts
  for (const job of jobs()) {
    runJob(job)                                    // <- fires immediately

    if (!job.schedule) {
      logger.warn(`[CRON] no schedule configured for ${job.name}, skipping`)
      continue
    }
  ```

  The immediate `runJob(job)` is above the schedule check, so a job with no
  schedule has already run by the time the log says it is being skipped. Two of
  the three jobs write: `anonymous visitors` DELETEs up to 5 000 `auth.users`
  rows and their checkouts, address books, sessions and accounts;
  `settle paid orders` advances order statuses (see F5). Every deploy,
  restart and crash-loop restart therefore fires a delete sweep and a status
  sweep, on every instance, with no advisory lock between instances.

  Combined with F5 this is the concrete hazard: two instances booting together
  run `sweepSettledIntents` concurrently with no transaction and no guard.
- fix: move `runJob(job)` below the schedule and `cron.validate` checks so an
  unscheduled job stays unscheduled, and give the two writing jobs a
  `pg_try_advisory_lock` so one instance runs them.

### F7 the half of the payment safety net that returns the customer's money is not scheduled at all [severity: rule]

- where: `api/src/shared/cron/scheduler.ts:15-35`;
  `api/src/domains/transactions/sweeps.ts:52-66`; `api/.env`
- proof: `jobs()` lists three jobs. `sweepAbandoned` — the one that cancels a
  stale sale, cancels its Stripe intent and calls `credit.addFunds` to release
  the reserved `dorado_funds` — appears in none of them. Grepping
  `api/src/` for `sweepAbandoned` outside its own file returns only
  `domains/transactions/tests/sweeps.test.ts` and
  `scripts/reconcile-payments.ts`, which is a hand-run script.

  Separately, `PAYMENT_RECONCILE_SCHEDULE` — the variable that would schedule
  the half that *is* wired (`sweepSettledIntents`) — is absent from `api/.env`
  (`ANONYMOUS_SWEEP_SCHEDULE`, `SPOT_UPDATE_SCHEDULE` and a vestigial
  `STALE_OFFERS_UPDATE_SCHEDULE` are present; that last one is read by
  nothing). So on this configuration the settled sweep runs only at boot (F6)
  and the abandoned sweep runs only when somebody types
  `reconcile:payments --commit`. I cannot see the production environment, so
  this is proven for the checked-in config only.
- fix: schedule `sweepAbandoned` alongside `sweepSettledIntents` under the same
  variable, or state in `scheduler.ts` why releasing a customer's reserved
  credit is deliberately manual. Set `PAYMENT_RECONCILE_SCHEDULE` in `api/.env`
  and delete `STALE_OFFERS_UPDATE_SCHEDULE`.

### F8 `env.ts` composes `DATABASE_URL` to **dev** by default, which defeats `pool.ts`'s refusal [severity: data]

- where: `api/src/env.ts:55-68`; `api/src/pool.ts:6-21`
- proof: `pool.ts` refuses to start with an unset `DATABASE_URL` and its
  message says why — *"Refusing rather than letting pg fall back to
  PGHOST/PGUSER/PGDATABASE, which would open a working connection to a
  different database."* But `pool.ts` imports `#env` first, and `env.ts` has
  already filled the variable in:

  ```ts
  DATABASE_URL: () => dorado(process.env.DEV_DATABASE ?? 'dev'),
  ```

  So on any host that has `PGHOST`, `DORADO_USER` and `DORADO_PASSWORD` but no
  explicit `DATABASE_URL`, the guard cannot fire and the process connects to
  **dev** — silently, with no log line naming the database. The guard is also
  waived entirely when `NODE_ENV === 'production'`
  (`refusesUnsetDatabaseUrl` returns false), which is the one environment where
  connecting to the wrong database matters most.

  Not reachable in this checkout: `api/.env` sets `DATABASE_URL` explicitly and
  defines no `PGHOST`/`DORADO_USER`, so `compose()` returns `undefined` and the
  whole `COMPOSED` block is inert today. The hazard is the shape, not the
  current value.
- fix: have the composed default refuse rather than guess — compose only when
  `DEV_DATABASE` is set explicitly — and log the resolved database name at
  boot the way `migrate.mjs` does (`database: ${name} @ ${host}`). Drop the
  `NODE_ENV !== 'production'` exemption in `pool.ts`.

### F9 `seed-e2e-users.mjs` plants a hardcoded admin password into whatever `DATABASE_URL` names [severity: authz]

- where: `api/scripts/seed-e2e-users.mjs:8-21, 37-40`; excused in
  `api/scripts/lint-script-guards.mjs:59-66`
- proof: the script creates `e2e-admin@example.invalid` with the literal
  password `e2e-Admin-Password-1`, then `UPDATE auth.users SET role = 'admin',
  "emailVerified" = true`. It reads `DATABASE_URL` and has **no database
  allowlist of any kind** — no name check, no `--commit`, no dry run. The same
  is true of `seed-e2e-order.mjs`, which inserts orders, items and shipments.

  Every other write-capable script in `api/scripts/` does guard its target:
  `migrate.mjs:114-123` (allowlist + `MIGRATE_ALLOW_DB`),
  `provision-test-db.ts:35-42` (name allowlist + `system_identifier`
  comparison), `refresh-from-backup.mjs:11,33` (`REFRESHABLE` set),
  `reset-january.ts:227-257` (`--database` must match `--url` must match
  `current_database()`), `audit-test-leaks.ts:18-44` (`isSafeName`). The two
  seeds are the exception, and `lint-script-guards.mjs` excuses them on a
  claim — *"An action against the test database"* / *"against the dev
  database"* — that nothing enforces.
- fix: give both seeds the `isSafeName` check `audit-test-leaks.ts` already
  has (`dev`, `test`, `test_<branch>`) and make them exit 1 anywhere else. Ten
  lines, in `api/scripts/`.

### F10 the gram and pound conversion constants are wrong, in both the JavaScript and the SQL [severity: money]

- where: `api/src/shared/utils/convertWeights.ts:7,11`;
  `metals.convert_to_troy_oz` in `api/migrations/000_genesis_schema.sql:3643`
- proof: a troy ounce is 31.1034768 g and an avoirdupois pound is 453.59237 g,
  so 1 lb is exactly 175/12 = 14.583333… t oz. Both implementations use
  `31.1035` and `453.592`:

  ```
  convertTroyOz(1,'lb') = 14.583310559904833   true 175/12 = 14.583333333333334
  lb error on 100 lb of gold at $3000/t oz: -$6.83
  g  divisor: code 1/31.1035 = 0.03215072…     true 0.03215074…
  ```

  The error is signed: the code returns **less** fine metal than the weight
  really is, so the customer is underpaid. `convertWeights.test.ts:26` pins the
  wrong value (`14.5833105`) and `:40-51` asserts the SQL agrees with it, so
  both sides are wrong together and the tests certify it.
- fix: use `31.1034768` and `453.59237` (or the exact `175/12` for lb) in
  `shared/utils/convertWeights.ts` and in the genesis definition of
  `metals.convert_to_troy_oz`, and update the pinned constant in the test.

### F11 an upstream carrier's HTTP status becomes the API's own answer to the customer [severity: rule]

- where: `api/src/shared/middleware/errorHandler.ts:286-299`
- proof:

  ```ts
  const status =
    domainStatus ||
    (safe.kind === 'axios' && safe.status) ||
    raised.statusCode || raised.status || 500
  ```

  For any axios failure the client is answered with FedEx's status code. A
  FedEx 401 (our OAuth credentials expired) is returned to a signed-in customer
  as `401`, which is this API's own "you are not authenticated" answer; a FedEx
  403 becomes "that is not yours". The body already carries `carrier_status`
  separately, so the information is not lost by fixing this. `raised.status` is
  also typed `unknown` and passed straight to `res.status(...)`, which throws
  in Express 5 for a non-numeric value.
- fix: an upstream failure is a `502`. Return 502 with the existing
  `carrier_status` / `carrier_transaction_id` fields, and coerce
  `raised.statusCode ?? raised.status` through `Number.isInteger` before it
  reaches `res.status`.

### F12 the four payment-intent lookups take `LIMIT 1` from an ordering that cannot break its own ties [severity: data]

- where: `api/src/db/payments/intents/sql/find_reusable.sql:27-38`,
  `find_for_order.sql:27-34`, `find_open_for_user.sql:11-17`,
  `find_facts_by_ref.sql:11-15`
- proof: each joins `payments.attempts` (and `find_reusable` /
  `find_for_order` also `payments.settlements`) and then orders by
  **intent** columns only — `ORDER BY i.created_at DESC, i.id LIMIT 1`. Every
  row of a fan-out from one intent has identical values in both, so which
  attempt survives the `LIMIT 1` is whatever the planner emits. What is
  selected from those rows is the Stripe PaymentIntent id
  (`a.provider_ref`, handed straight back to `stripe.retrieveIntent`) and
  `st.settled_amount AS amount_received`.

  `payments.attempts.intent_id` has no unique index (only
  `attempts_provider_ref_key` on `provider_ref`), so the schema permits the
  fan-out. Today it does not happen: `recordIntent`
  (`domains/transactions/service.ts:104-124`) creates exactly one attempt per
  intent with `id: intent_id`, and one settlement per attempt with the same id.
  So this is a latent hazard, not a bug I could reproduce — the moment a second
  attempt or settlement is ever written, the endpoint starts returning an
  arbitrary one.
- fix: add `a.created_at DESC, a.id` (and the settlement equivalent) to each
  `ORDER BY`, or resolve the attempt in a `LATERAL` subquery that names its own
  ordering. Four SQL files under `db/payments/intents/sql/`.

### F13 `metals.convert_to_troy_oz` has no caller, and the test that pins it certifies a divergence [severity: complexity]

- where: `api/migrations/000_genesis_schema.sql:3643`;
  `api/src/shared/utils/tests/convertWeights.test.ts:40-66`
- proof: grepping `api/src/**/*.sql` for `convert_to_troy_oz` returns nothing —
  the pricing SQL reads `ci.content` / `p.content`, the value the JavaScript
  `fineContent` already wrote. The function's only caller is the test. That
  test's last case is:

  ```ts
  test('they part company on a unit nobody uses - zero here, NULL in the database', ...
    assert.equal(convertTroyOz(100, unit), 0, ...)
    assert.equal(await sql(100, unit), null, ...)
  ```

  So the suite records that the two implementations disagree on exactly the
  input that matters (F4) and asserts the disagreement rather than the
  behaviour. The reassurance a reader takes from "the database agrees with the
  JavaScript" is not available: the database's version prices nothing.
- fix: delete `metals.convert_to_troy_oz` and the mirror tests, or move the
  conversion into SQL so the pricing path and the stored `content` share one
  implementation. Either way, fix F4 first — the divergence test is currently
  the only thing documenting it.

### F14 the customer's address book comes back in an arbitrary order [severity: rule]

- where: `api/src/db/places/user-addresses/sql/get_for_user.sql`
- proof: the file is `SELECT ... FROM places.user_addresses WHERE user_id = $1`
  with no `ORDER BY`, and `listFor` returns the rows as they arrive. Postgres
  moves an updated row within its heap, so editing one address silently
  reshuffles the list on the next read. Every other list SQL in this repo that
  a customer sees does carry an `ORDER BY` (`refiners/spots/sql/get_for_order`,
  `checkout/checkouts/sql/view`, `shipping/shipments/sql/view`, …); this is the
  outlier. The other thirteen `ORDER BY`-less files are `get_many` lookups
  whose rows are keyed into a map, where order genuinely does not matter.
- fix: `ORDER BY default_shipping DESC, label ASC, id ASC` — or whatever the
  book should show first — in `get_for_user.sql`.

### F15 `withTransaction` can replace the real failure with the rollback's failure [severity: rule]

- where: `api/src/shared/db/withTransaction.ts:19-24`
- proof:

  ```ts
  } catch (err) {
    await client.query('ROLLBACK')
    throw asDomainError(err)
  }
  ```

  If the connection has died — the common reason `fn` threw in the first place
  — `client.query('ROLLBACK')` rejects, and that rejection propagates instead
  of `err`. The original error is never thrown, never logged, and
  `asDomainError` never runs on it, so a 23503 that would have become a clean
  `Invalid` surfaces as a raw connection error. Not reproduced (it needs a
  killed connection); the control flow is on the line.
- fix: wrap the rollback in its own try/catch, log the rollback failure, and
  rethrow `asDomainError(err)` unconditionally.

## Verified correct (suspected and disproved)

- **`audit:test-leaks` after the `src/` move.** It fingerprints every schema
  (`schemas()` excludes only `pg_*`, `public`, `information_schema`), not just
  `exchange`, so auth writes through better-auth's own pool are in scope. Its
  `isSafeName` accepts `test_<branch>`, and `suiteInvocation()` propagates
  `TEST_DATABASE`/`TEST_DATABASE_URL` into the spawned suite, so parent and
  child fingerprint and write the same database.
- **`migrate.mjs` forcing `ssl` against the local cluster.** I expected the
  preflight's auto-migrate to fail on loopback; connecting with
  `ssl: { rejectUnauthorized: false }` to 127.0.0.1:5544 succeeds, and the
  preflight applied twelve migrations to `test_review_lane` cleanly.
- **`audit_stamp` pinning anonymous visitors.** Migration 122 added
  `AND NOT COALESCE(u."isAnonymous", false)` to the actor lookup for exactly
  the reason in F2 — measured live: an INSERT with `app.actor_id` set to an
  anonymous user leaves `created_by_id` NULL. The `*_by_id` FKs are not what
  blocks the sweep; the seven `user_id` columns are.
- **`deferAddressOwnership` deferring only the recipient key.** Migrations 127
  and 128 removed `shipper_address_id` and `pickup_address_id` from
  `checkout.checkouts`; `checkouts_recipient_address_theirs_fk` is the only
  composite key left, so covering one is covering all of them.
- **`shipping.services` insurance ceilings.** `max_insured_value` is NOT NULL
  and `(carrier_id, name)` is UNIQUE, so `ceilingFor`'s `.find` by name is
  deterministic and `lowestCeiling`'s `Number(null) === 0` trap cannot fire.
  The missing `ORDER BY` in `get_insurance_ceilings.sql` is harmless for the
  same reason.
- **Timestamp handling.** Every repo that `.parse()`s a contract reads its
  timestamps through `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  the SQL that returns raw `timestamptz` is never parsed, and `JSON.stringify`
  of a pg `Date` produces the identical string. No drift.
- **Unique constraints the repos assume.** `orders.spots(order_id, metal_id)`,
  `orders.transactions(order_id)`, `orders.addresses(order_id)`,
  `refiners.items(order_item_id)`, `refiners.orders(order_id)`,
  `checkout.checkouts(user_id, direction)`,
  `fulfillments.{directs,pickups}(fulfillment_id)`,
  `fulfillments.shipments(shipment_id)`,
  `places.user_addresses(user_id, address_id)` and the partial
  `(user_id) WHERE default_shipping` all exist. `refiners.spots` has no
  `(order_id, metal_id)` unique, but `refiners.orders(order_id)` is unique and
  `mirror_for_order` dedupes on `(refiner_order_id, metal_id)`, so the pair is
  unique in practice.
- **`adjust_credit.sql`'s `CASE` with no `ELSE`.** An unrecognised mode would
  set `dorado_funds = NULL`; `CreditOp` is `z.enum(['add','subtract','edit'])`
  and every call site passes a literal or a parsed body, so it is unreachable.
  Worth an `ELSE` anyway (see Simplifications).
- **`buildUpdate` injection surface.** `table`, the `allowed` column names and
  the `casts` types are all interpolated raw, but every one of them is a code
  constant derived from a contract; values are always bound.
- **`products/repo.ts`'s `__ORDERING__` substitution.** `sort` is validated by
  `z.enum(['name','content','newest']).default('name')` at the controller, so
  `ORDERINGS[...]` cannot be `undefined`.
- **No direct pool use.** Nothing outside `shared/db/`, `shared/testing/` and
  `pool.ts` calls `pool.query` or `pool.connect`; the executor threading holds.
- **Route mount collisions.** `/api/refiners` carries two routers; their paths
  (`/items/by-order-item/:orderItemId`, `/orders/:id`) do not overlap.

## Simplifications (not bugs)

- `shared/views.ts` — `withEachDecision` has zero callers; delete it.
  `withDecisions` is `Object.assign(view, decisions)`, which **mutates** its
  argument while its `V & D` return type reads as a merge. Every one of its
  eight callers happens to pass a freshly fetched row, so nothing is wrong
  today; returning `{ ...view, ...decisions }` removes the trap.
- `db/refiners/items/repo.ts:30` — `byOrderItem` guards against duplicate
  `order_item_id` (`if (!out.has(...))`), but
  `refiners_items_order_item_id_key` makes that impossible. Dead defence that
  makes a reader think duplicates are a real case.
- `db/users/sql/adjust_credit.sql` — the `CASE` has no `ELSE`, so an
  unrecognised mode would NULL the balance. Add
  `ELSE (SELECT NULL WHERE false)`, or simply `ELSE dorado_funds`, so the
  statement cannot destroy a balance even if a caller ever gets past the enum.
- `db/orders/transactions/repo.ts:42-52` — the direction guard is bolted on by
  string-substituting `'\n RETURNING'` inside SQL `buildUpdate` just produced.
  It works only because `returning: 'id'` is always set. `buildUpdate` should
  take an `exists` clause the way it takes `whereNull`.
- `db/shipping/pickups/repo.ts:39-50` and `db/shipping/carriers/repo.ts:32-39`
  are the last two repos with hand-written positional `update` SQL rather than
  `buildUpdate`; both therefore write every column on every call, which is F3's
  shape without F3's NOT NULL to catch it (`shipping.pickups` columns are all
  nullable, so a partial patch silently blanks the rest).
- `pool.ts:23-27` — both type parsers test `value === null`, which node-pg
  never passes; the branches are dead.
- `shared/db/query.ts:18-42` — the racing-query guard only arms when a client
  is passed explicitly. Inside `inPinnedTransaction` the pool itself is
  redirected to the pinned client, so two un-awaited repo calls with no
  executor race on one connection with the guard looking the other way.
- `env.ts:35-53` — `deriveTestDatabaseName` shells out to `git` three times at
  module import. It is gated behind `USE_TEST_DB=1` so a server never does it,
  but `#env` is imported by `#pool` and therefore by every repo; a
  `execSync` at import time is worth a comment saying why it is safe.
