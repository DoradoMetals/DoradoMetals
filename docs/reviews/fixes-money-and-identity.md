# fixes: money and identity (lane B)

Worktree `/home/jtj60/dorado-lanes/fixb`, branch `fixb-lane`. Scope as assigned:
`shared/**`, `transactions/**`, `accounts/**`, `providers/payment/**`, `app.ts`,
`env.ts`, `pool.ts`, `scripts/seed-*`, plus the `db/` tables those own
(`db/payments/**`, `db/users/**`, `db/media/**`, `db/places/user-addresses/**`).

Gate: `pnpm check` green except the pre-existing `figma:inventory`.
Migration taken: **135** (`135_a_balance_cannot_go_below_zero.sql`). It was
written as 134 and renumbered - lane A's `134_one_definition_of_fine_content.sql`
keeps that number. See "The 134 collision" at the end.

---

## Per finding

### 1 — `requireOwnShipment` resolves a different subject than its handler [MI F1, MA F1] — FIXED

`shared/middleware/ownership.ts`. The guard read
`body.shipment_id ?? query.shipment_id ?? params.id`, so a query string outranked
the path parameter that `getShipment` actually reads.

The guard now collects **every** shipment the request names — `params.id`, the
body's `shipment_id`, the query's — and requires the caller to own **all** of
them, in one `= ANY(...)` read. That is subject-source-agnostic, so both routes
the guard serves keep working unchanged (`GET /api/shipments/:id` from the path,
`POST /api/shipping/get_tracking` from the body) and neither route file — both
lane C's — had to be touched. A named id that is not uuid-shaped is a 403 rather
than a 22P02 500.

Audit of the other two guards in that file:

- `requireOwnOrderParam` reads `params.id ?? params.orderId`; every handler
  behind it reads `uuidParam(req, 'id')` or `'orderId'`. Correct, unchanged.
- `requireOwnOrder` read `body.order?.id ?? body.order_id`. Its one route is
  `POST /api/quotes/order`, whose handler reads `body.order_id`. The
  `body.order.id` branch was a second, higher-priority source the handler cannot
  see — the same defect shape, not exploitable today only because `parseStrict`
  would 400 on the extra key afterwards. **Deleted**; the guard reads
  `order_id` only.

Tests: `api/src/shared/middleware/tests/ownership.test.ts` — the query trick and
the body trick each 403, both legitimate single-subject shapes still pass, a
non-uuid is 403, no subject is 400, no session is 401.

### 5 — credit debit with no lock and no floor [MI F3, MP F7] — FIXED (code + constraint)

`transactions/credit/service.ts` `removeFunds(user_id, total, tx)` now, inside
the caller's transaction: reads `users.balanceForUpdate` (`SELECT ... FOR
UPDATE`), refuses through `refuseNegativeBalance(balanceAfter('subtract', …))`,
then adjusts. Two concurrent placements therefore serialise on the row lock and
the second one refuses instead of driving the balance to -100.

Migration **135** adds `CHECK (dorado_funds >= 0)` on `auth.users`, `NOT VALID`
— enforced on every insert and update from the moment it exists, without a scan
that a pre-existing negative row could fail. Genesis regenerated with
`dump:schema`, contracts regenerated, `lint:migrations` green, applied to dev.

**What lane A must call**: nothing new. `placeSale` already calls
`credit.removeFunds(checkout.user_id, quote.pre_charges_amount, tx)` — that call
is now the locked, floored one, and it **throws `Invalid`** when the priced
balance no longer covers the debit (message: `…a credit balance cannot go below
zero`). Lane A's remaining work is to decide what the placement does with that
refusal: today it will surface as a 422 and the transaction rolls back, which is
correct but re-prices nothing. If `placeSale` should instead recompute the
applied credit from the locked balance, the value it needs is the return of
`users.balanceForUpdate(user_id, tx)` — call it before `removeFunds` inside the
same transaction; no new export is required.

Tests: `transactions/credit/tests/funds.test.ts` (over-spend refused and the
balance does not move; two debits of the same balance — the second refuses; the
column itself refuses a raw negative UPDATE), `db/users/tests/repo.test.ts`
(`adjustCredit` at the repo level is refused by the constraint).

### 11 — nothing compared Stripe's amount to the order total [MI F7] — FIXED

`transactions/rules.ts` gains `settlementCovers(amount_received,
post_charges_amount)` — true when the order owes nothing or the settlement
covers the total within half a cent.

- `webhook.ts applyIntentEvent` reads the order's
  `orders.transactions.post_charges_amount` and advances to `Preparing` only if
  covered; a short settlement is reported through `reportError` and the order
  stays where it is.
- `sweeps.ts sweepSettledIntents` does the same per candidate, returning
  `outcome: 'held'` instead of `'advanced'`.

Tests: `transactions/tests/settlement-and-confirmation.test.ts` — a $100
settlement against a $500 order leaves it `Pending`; a full settlement advances
it; the sweep holds one and advances the other; the rule's own table.

### 14 — `set_password` mints a credential from a session alone [MI F14] — FIXED

**The choice, and why.** better-auth 1.6.9's `changePassword` is the endpoint
that takes a current password; `setPassword` exists precisely for accounts that
have **no** credential row (Google, magic link, anonymous), where there is no
current password to ask for — and better-auth already refuses with
`PASSWORD_ALREADY_SET` when one exists. So "require the current password" is not
available on this flow. What better-auth does support is session freshness:
`setPassword` uses `sensitiveSessionMiddleware` (a real session, cookie cache
bypassed) while `freshSessionMiddleware` — the one that checks
`session.createdAt` against `sessionConfig.freshAge` — is not wired to it.

`accounts/auth/controller.ts` now re-reads the session with
`disableCookieCache: true`, calls `assertMaySetPassword` (new
`accounts/auth/rules.ts`), and after linking calls
`auth.api.revokeOtherSessions`. The rule refuses: an anonymous visitor
outright, a session with no `createdAt`, a session stamped in the future, and
any session older than **15 minutes** (`PASSWORD_SESSION_FRESH_SECONDS`).
Fifteen minutes is tighter than better-auth's one-day `freshAge` default because
this endpoint mints a permanent credential from a cookie.

Tests: `accounts/auth/tests/set-password.test.ts`.

### 15 — seed plants an admin password anywhere; env.ts defaults to dev [MA F9, MA F8] — FIXED

- New `api/scripts/lib/safe-database.ts` (`isSafeName`, `databaseNameOf`,
  `assertSafeDatabase`) — the allowlist `audit-test-leaks.ts` already carried,
  now shared. `seed-e2e-users.mjs` and `seed-e2e-order.mjs` both call it and
  print the database they resolved; anything but `dev`, `test` or
  `test_<branch>` exits 1. `lint-script-guards.mjs`'s excuses for both seeds now
  name the guard instead of claiming one.
- `env.ts` `COMPOSED.DATABASE_URL` composes **only** when `DEV_DATABASE` is set
  explicitly. It used to be `dorado(process.env.DEV_DATABASE ?? 'dev')`, which
  filled the variable in on any host carrying `PGHOST`/`DORADO_USER`/
  `DORADO_PASSWORD` and made `pool.ts`'s refusal unreachable.
- `pool.ts` `refusesUnsetDatabaseUrl` drops the `NODE_ENV !== 'production'`
  exemption — production was the one environment where connecting to the wrong
  database matters most and the one that was exempt.

Tests: `api/scripts/lib/tests/safe-database.test.ts`; `api/tests/db.test.ts`
(the guard refuses in every environment now, and env.ts no longer hardcodes
`'dev'`).

### 16 — one visitor stops the anonymous sweep for ever [MI F9, MA F2] — FIXED

`db/users/anonymous/sql/list_stale.sql` and `delete.sql` both now exclude any
visitor still referenced by a table the delete does not clear: `auth.employees`,
`auth.sessions.impersonatedBy`, `orders.orders`, `payments.intents`,
`payments.details`, `payments.ledger`, `media.images`, `media.emails`,
`reviews.reviews`. The four the delete does clear (`checkout.checkouts`,
`places.user_addresses`, `auth.sessions`, `auth.account`) are unchanged.

**Deliberately not "delete the referencing rows too".** A visitor who reached a
payment intent, an order or a ledger row holds records the covenant covers;
deleting them to make a housekeeping sweep tidy is the wrong trade. Such a
visitor is simply never a candidate — the sweep skips them and keeps making
progress, which is the whole defect. The guard sits in `delete.sql` as well as
`list_stale.sql`, so a row written between the list and the delete cannot raise
23503 either: the blocker is filtered out of the CTE and the rest of the batch
still goes. The caller sees it as `considered > deleted.length`.

`places.addresses` was checked and has no audit columns at all, so there is
nothing to guard there. `domains/checkout/sweep.ts` (lane A's folder) is
unchanged and needs no change.

Tests: `db/users/tests/anonymous.test.ts` — a visitor with an intent is not a
candidate and does not take an innocent visitor down with them; image and ledger
references keep a visitor out; a plain stale visitor still goes with their
checkout.

### 17 — sweeps and cron [MP F11, MA F5, MA F6, MA F7, MP F8, MI F15] — MOSTLY FIXED

- **Boot runs**: `shared/cron/scheduler.ts` no longer calls `runJob(job)` above
  the schedule check. An unscheduled job now really is skipped instead of having
  already deleted up to 5 000 users and advanced order statuses by the time the
  log says so.
- **The refund half has a caller**: the third job is now `reconcile payments`
  and runs `sweepSettledIntentsNow()` then `sweepAbandoned(ABANDONED_AFTER_HOURS
  = 24)` — the same pair `reconcile:payments --commit` runs by hand. They share
  `PAYMENT_RECONCILE_SCHEDULE` because they are two halves of one
  reconciliation, and because the scheduler test asserts one schedule variable
  per job.
- **Guard, lock and transaction**: `sweepSettledIntents(tx: Executor)` is now a
  writer taking a **required** tx, with `sweepSettledIntentsNow()` opening it
  (the shape `checkout/sweep.ts` already uses). The advance passes the guard
  `{ status: 'Pending' }` — the same predicate the candidate query selects on,
  so the read and the write are one atomic conditional UPDATE — and the boolean
  is observed rather than discarded. `scripts/reconcile-payments.ts` calls
  `sweepSettledIntentsNow()`.
- **NOT done, deliberately: MI F15's `AND o.status = 'Pending'` on
  `find_abandoned_sales.sql`.** Two reasons. It is lane A's SQL, and more
  importantly it contradicts a standing ruling: statuses are pure labels driving
  no logic (D211, "statuses are flair, every decision is a payment fact"), and
  `domains/orders/tests/place-sale.test.ts` pins exactly that — *"an unsettled
  sale is superseded by fact, whatever its label says"* calls `cancelPendingSale`
  on a `Preparing` order and requires it to cancel. I added a status guard there,
  saw that test fail, and reverted it. The payment facts already close both money
  paths: the `NOT EXISTS` on the Credit ledger row plus `hasCreditFor` prevent a
  double refund, and the `i.status NOT IN ('succeeded','processing','canceled')`
  clause drops an order as soon as its Stripe cancel lands. The residue is an
  idempotent `UPDATE … SET status='Cancelled'` on an order that has no intent at
  all, which costs nothing and calls Stripe not at all.
- **NOT done: a multi-instance advisory lock on the writing jobs** (MA F6's
  second half). It needs a connection held for the job's lifetime and was out of
  proportion to the finding; the guard above makes the settled sweep safe to run
  twice concurrently, and the anonymous sweep's deletes are idempotent.
- **`PAYMENT_RECONCILE_SCHEDULE` is still absent from `api/.env`**, and
  `STALE_OFFERS_UPDATE_SCHEDULE` is still there reading into nothing. Editing
  `.env` was out of scope. **Jacob**: set `PAYMENT_RECONCILE_SCHEDULE` (the
  reconcile job does not run at all without it, and it is the job that gives a
  customer their credit back) and delete `STALE_OFFERS_UPDATE_SCHEDULE`.

Tests: `shared/cron/tests/scheduler.test.ts` (nothing runs at boot; `setupScheduler`
with every schedule cleared runs nothing; `sweepAbandoned` has a caller; the job
names), `transactions/tests/settlement-and-confirmation.test.ts` (the sweep's
guarded advance is a no-op on a row that moved on).

### 21 — the idempotency key outlives its intent; typeless calls [MI F5, F6, F10] — FIXED

- **The key.** `rules.ts idempotencyKeyFor(type, user_id, session_id, attempt)`
  →`intent:<type>:<user>:<session>:<n>`. `n` is
  `intents.countFor(session_id, user_id, type)` — a **database fact** (the
  intents that session/user/purpose already has), read in
  `createPaymentIntent` just before the Stripe call. So a genuine network retry
  of the same attempt still replays, and the next intent in the same session
  gets a new key instead of being handed back the resolved PaymentIntent (and
  then colliding on `attempts_provider_ref_key`). A random nonce was the
  reviewer's first suggestion and is what `lint:no-minted-ids` forbids —
  `randomUUID()` outside tests — hence the ordinal. New
  `db/payments/intents/sql/count_for.sql`.
- **`type` is required by contract.** New `PaymentIntentType =
  z.enum(['sales_order_checkout', 'admin'])` in
  `packages/contracts/src/payments/intents.ts` — the only two values production
  holds and the only two the frontend sends. `UpdatePaymentIntentBody.type` is
  now required; `retrievePaymentIntent`'s controller parses
  `req.query.type` through it, so a typeless call is a **400 before** anything
  reaches Stripe rather than a live PaymentIntent with no local row. The service
  chain is typed `PaymentIntentType` end to end and
  `db/payments/intents/repo.ts create` binds `row.type` with no `?? null`.
- **F10**: `find_reusable.sql` is `i.type IS NOT DISTINCT FROM $3`, so the
  comparison cannot silently be UNKNOWN.

Cassette note: `metadata[type]` is now normalised in
`shared/testing/cassettes.ts` (`STRIPE_VOLATILE`) the way `customer`,
`metadata[user_id]` and `metadata[session_id]` already were, and the five
recorded stripe fixtures carry `SCRUBBED_INTENT_TYPE`. The intent type is no
longer part of cassette matching, so renaming it again costs nothing. **No live
Stripe call was made.**

Tests: `transactions/tests/idempotency-and-type.test.ts`.

### 22 — `intents.details_id` / `method_id` never written [MI F12] — FIXED

`webhook.ts recordInstrument` now takes the intent id (from `prior.intent_id`)
and, in the **same transaction** as the `payments.details` write, sets
`details_id` and `method_id` on that intent. Both branches — an instrument seen
before and a first sighting — link. `applyMethodEvent` passes `null` because a
`payment_method.updated` event names no intent.

Test: `transactions/tests/instruments.test.ts` — the intent's `details_id`
equals the row that was written.

### 23 — the confirmation email is lost on the webhook's own retry [MI F11] — FIXED (webhook half)

The send is no longer driven by `prior?.payment_status !== 'succeeded'` — the
guard that made a redelivery skip the mail whether or not the first attempt
worked (and `sendOrderPlacedConfirmation` wraps everything in `attempt`, so the
first attempt fails silently). It is now driven by the fact:
`emails.hasSent(order_id, ['purchase_order_created'])` — new
`db/media/emails/sql/has_sent.sql`, `status = 'sent'` only, so a recorded
failure still allows a resend. The status advance is separately idempotent
through the `{ status: 'Pending' }` guard.

Residual, stated rather than hidden: two webhook deliveries arriving
**concurrently** can both read "no confirmation yet" and both send. Closing that
needs a lock held across a send that happens after commit, which is a bigger
change than the finding.

**Lane C**: `media.email_kind` gained `sales_order_created` in dev (not from
this lane). If `documents/emails/service.ts` starts recording a sales
confirmation under that kind, the constant `PLACED` in
`domains/transactions/webhook.ts` must gain it — the repo call already takes an
array. It is `['purchase_order_created']` today because that is the kind
`sendCreatedEmail` records for both directions, and because the enum value does
not exist in this branch's test database.

Tests: `transactions/tests/settlement-and-confirmation.test.ts` — not re-sent
when a `sent` row exists; **is** sent on a redelivery whose intent was already
`succeeded` and which left no record.

### 39 — `LIMIT 1` on an ordering that cannot break ties; unordered address book [MA F12, MA F14] — FIXED

- `find_reusable.sql`, `find_for_order.sql` order by
  `i.created_at DESC, i.id, a.created_at DESC, a.id, st.created_at DESC, st.id`;
  `find_open_for_user.sql` and `find_facts_by_ref.sql` add the attempt pair.
  The value that survives `LIMIT 1` is handed to `stripe.retrieveIntent`, so it
  is now the newest attempt rather than the planner's choice.
- `db/places/user-addresses/sql/get_for_user.sql` gains
  `ORDER BY default_shipping DESC NULLS LAST, default_billing DESC NULLS LAST,
  label ASC NULLS LAST, id ASC`.

Tests: `db/payments/intents/tests/repo.test.ts` (a two-attempt fan-out resolves
to the newer one), `db/places/user-addresses/tests/repo.test.ts` (the book is
ordered, and editing a row does not reshuffle it).

### 40 — `withTransaction` can replace the real failure with the rollback's [MA F15] — FIXED

`shared/db/withTransaction.ts` wraps the `ROLLBACK` in its own try/catch,
reports the rollback failure through `reportError`, and rethrows
`asDomainError(err)` unconditionally. (`shared/` is outside `lint:one-catch`'s
walk, which covers the domain roots only.)

Test: `shared/db/tests/withTransaction.test.ts` — a client whose `ROLLBACK`
rejects still surfaces the original error, and the client is released.

### 41 — `MediaUploadBody.mime_type` optional on a NOT NULL column [MI F13] — FIXED

`packages/contracts/src/media/images.ts` drops the
`.nullable().optional()` override, so `MediaUploadBody.mime_type` is the
generated required `z.string()`. `accounts/images/controller.ts` passes
`body.mime_type`, and `uploadImage`'s parameter is `string`. A missing or null
`mime_type` is a 400 at the boundary instead of a 23502 500.

Test: `accounts/images/tests/body-validation.test.ts`.

### 28, 35 — decisions Jacob has not made: behaviour UNCHANGED, pinned

- **28 (credit debited at placement; only a script refunds; interacts with
  ruling 85)** — pinned in `transactions/credit/tests/funds.test.ts`: a debit is
  immediate and writes **no** `payments.ledger` row, which is why `hasCreditFor`
  is what stops a double refund. Note that finding 17 *does* now schedule
  `sweepAbandoned`, so the credit comes back on a schedule rather than only when
  somebody runs `reconcile:payments`; the reserve-vs-spend model itself is
  untouched and is the part awaiting a ruling.
- **35 (the five-minute session cache)** — pinned in
  `accounts/auth/tests/config-options.test.ts`: `cookieCache.enabled` is `true`,
  `maxAge` is 300, and `requireAuth` still never reads `banned`. The test says
  in full why changing it needs a ruling.
- **36 (public reviews disclose staff ids)** — lane C's.

---

## Boundary crossings, and what other lanes need to know

1. **`api/src/domains/checkout/tests/journeys/buy-journey.test.ts` (lane A) — one
   token changed**: `.send({ type: 'customer' })` → `'sales_order_checkout'`,
   forced by finding 21's contract. Without it the gate fails. No other file
   under `orders/**`, `checkout/**` or `pricing/**` was touched.
2. **Lane A, finding 5**: `credit.removeFunds` now throws `Invalid` rather than
   going negative — see finding 5 above for what `placeSale` should do with it.
3. **Lane A, finding 17 / MI F15**: `find_abandoned_sales.sql` deliberately has
   **no** status filter. If lane A adds one, it contradicts D211 and breaks
   `place-sale.test.ts`'s "superseded by fact, whatever its label says".
4. **Lane C, finding 1**: the routes were not touched. If you would rather have
   two narrow guards than one that checks every named subject, `ownership.ts` is
   the file and `requireOwnShipment` is the only export involved.
5. **Lane C, finding 23**: the `sales_order_created` email kind — see above.

## The 134 collision, and the one ledger row left over

Two lanes numbered a migration 134 on the same evening. Mine is renumbered to
**135**; lane A's `134_one_definition_of_fine_content.sql` keeps 134.

**Read read-only from dev, 2026-09-05, correcting the premise:** `auth.users`
holds **exactly one** check constraint, `users_dorado_funds_non_negative`,
`CHECK ((dorado_funds >= (0)::numeric)) NOT VALID`. That is mine - the ledger
timestamps show my file applied at 00:44:39 and the fine-content migration at
00:54:41. Lane A's migration adds **no** CHECK to `auth.users`; what it found
was this constraint already in place. So there is no second constraint to
reconcile with and no duplicate name, and 135 keeps `NOT VALID` rather than
validating, for the reason its header gives: a pre-existing negative balance
must be a person's decision, not a migration that refuses to apply.

**135 is now idempotent.** Its `ALTER TABLE` sits inside a `DO` block that adds
the constraint only when `pg_constraint` has no constraint of that name on
`auth.users`. That makes it correct three ways over: against dev (which has it,
under the old filename), against a database built from
`000_genesis_schema.sql` (which now carries it), and against one with neither.

**The ledger row was NOT hand-edited.** Writing `exchange.schema_migrations`
directly was refused by the permission system, twice, and I did not work around
it - `exchange` is the one schema this project does not let an agent write, and
an instruction from another agent is not the user's approval. Instead the
runner did its own bookkeeping: `pnpm --filter @dorado/api migrate` applied 135
as a guarded no-op and inserted its own row.

What that leaves on dev is one **orphan** ledger row,
`134_a_balance_cannot_go_below_zero.sql`, naming a file that no longer exists.
It is inert: `migrate.mjs` iterates over migration FILES and looks each up in
the ledger, so a ledger row with no file is never read, never re-run and never
warned about. `migrate:status` confirms it -
`applied 135_a_balance_cannot_go_below_zero.sql 2026-09-06T01:21:08`, nothing
pending, no checksum warning for 135. **If Jacob wants the row gone**, it is
`DELETE FROM exchange.schema_migrations WHERE name =
'134_a_balance_cannot_go_below_zero.sql'` on dev - his to run, and cosmetic.

## One gate declaration that is not a fix

`verify:backfill` newly failed on `media.pdfs holds 1 rows … not declared in
NOT_REBUILT`. A rendered PDF appeared in dev during this window (the document
endpoints persist one when they serve it). It is declared in
`scripts/verify-backfill.mjs` beside its sibling `media.emails`: a rendered
document is a generated artifact, exchange never stored one, and re-rendering
is what the endpoints already do. Nothing about it is this lane's change; the
declaration was simply missing because the table had held zero rows until now.

## Genesis and contracts carry changes that are not this lane's

Dev is shared between the three lanes. `dump:schema` and `contracts generate`
read dev, so `000_genesis_schema.sql` and `packages/contracts/src/media/enums.ts`
in this branch also carry **another lane's** dev changes:
`media.email_kind` + `'sales_order_created'`,
`shipping.shipments`'s `shipments_tracking_number_unique` partial index, and
`metals.convert_to_troy_oz` replaced by `metals.fine_content` (findings 9, 10
and 42 — the wrong gram and pound constants, now `31.1034768` and `175/12`).
None of the three has a migration file in this branch. They were already in dev before this lane
regenerated anything — `verify:genesis` and `contracts:verify:fresh` compare
against dev, so a gate green here requires them. Expect a conflict in those two
files at merge; the resolution is to regenerate after merging, not to hand-edit.
