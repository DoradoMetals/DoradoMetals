# money and identity review

Area: `api/src/domains/transactions/**`, `api/src/domains/accounts/**`,
`api/src/providers/payment/**`, `api/src/shared/crypto/**`,
`api/src/shared/middleware/**`, `api/src/db/{payments,places,media,users}/**`,
`packages/contracts/src/{payments,auth,places,media}`.

Reproductions ran read-only against `chain6` (the local rebuilt production copy)
and inside rolled-back transactions on the local `test` database at
127.0.0.1:5544. No dev or production database was touched.

## Findings (most severe first)

### F1 `requireOwnShipment` lets the caller name a different shipment than the one it serves [severity: authz]

- where: `api/src/shared/middleware/ownership.ts:147-185`,
  `api/src/domains/logistics/shipping/shipments/routes.ts:13`,
  `api/src/domains/logistics/shipping/shipments/controller.ts:18-25`
- proof: the guard resolves the subject from the body and the query **before**
  the path parameter:

  ```ts
  const shipmentId =
    req.body?.shipment_id ??
    req.query?.shipment_id ??
    (Array.isArray(rawParam) ? rawParam[0] : rawParam) ??
    null
  ```

  and then checks that id joins to an order with `o.user_id = req.user.id`. The
  handler behind it reads a different value: `getShipment` does
  `uuidParam(req, 'id')`. So
  `GET /api/shipments/<victim-shipment-id>?shipment_id=<my-own-shipment-id>`
  passes the ownership check against the attacker's own shipment and then serves
  the victim's shipment view. Same for a `shipment_id` in the body. Only
  `requireOwnShipment` has this shape - `requireOwnOrder` reads the body and its
  handlers read the body, and `requireOwnOrderParam` reads params only.
  Not run here: another lane left a probe for exactly this
  (`api/src/shared/middleware/tests/zz-review-probe.test.ts`, untracked, not
  mine) while this document was being written, so the reproduction is theirs;
  the reading above is from the source and the route table.
- fix: the guard must resolve the subject the same way its handler does - take
  the path parameter for `/:id` routes and drop the body/query fallbacks, or
  pass the resolved id forward on `req` so the handler cannot read a different
  one.

### F2 `POST /api/orders/:id/add_funds` is not idempotent - each call credits the customer again [severity: money]

- where: `api/src/domains/orders/service.ts:147-163`, `api/src/domains/orders/rules.ts:145-146`,
  `api/src/domains/orders/routes.ts:55`
- proof: the whole handler is

  ```ts
  export async function addFunds(order_id: string): Promise<OrderView> {
    const order = await viewOf(order_id)
    rules.assertDirection(order.order.direction, 'purchase', 'adding funds')
    const amount = order.totals?.total ?? null
    rules.assertCreditable(amount, order.order.number)          // only refuses amount === null
    await withTransaction(async (tx) => {
      await credit.addFunds(order.order.user_id, amount, tx)     // UPDATE ... dorado_funds + $1
      await ledger.addTransactionLog({ user_id, type: 'Credit', order_id, amount }, tx)
    })
  ```

  There is no guard on order status, on a prior payout, or on the ledger.
  `assertCreditable` (`rules.ts:251`) only refuses a null total. Two POSTs to
  the same purchase order therefore run `dorado_funds = dorado_funds + total`
  twice and write two `payments.ledger` Credit rows for the same `order_id`.
  Nothing turns the action off afterwards either - `actionsFor` returns
  `add_funds: purchase && totals.total != null && creditsToAccount(payout.method)`
  (`rules.ts:145`), which is still true once the credit has been paid, so the
  admin drawer keeps the button live.
  The correct guard already exists and is used elsewhere:
  `sweeps.cancelPendingSale` refuses to refund twice with
  `!(await transactionsService.hasCreditFor(order_id, client))`
  (`transactions/sweeps.ts:40`), backed by
  `db/transactions/sql/has_credit_for.sql`
  (`SELECT EXISTS (... WHERE order_id = $1 AND type = 'Credit')`).
  `api/src/domains/orders/tests/add-funds.test.ts` asserts one call moves the
  balance by the ledger amount; no test calls it twice.
- fix: `orders/service.ts addFunds` should read `ledger.hasCreditFor(order_id, tx)`
  inside the transaction and refuse (or no-op) when a Credit row already exists
  for that order - the same guard `cancelPendingSale` uses. `actionsFor` should
  drop `add_funds` once that row exists.

### F3 The sale credit debit takes no lock and has no floor - concurrent placements drive the balance negative [severity: money]

- where: `api/src/domains/orders/place.ts:200,240-249`,
  `api/src/domains/transactions/credit/service.ts:51-58`,
  `api/src/db/users/sql/adjust_credit.sql`, `api/src/db/pricing/sql/sale_quote.sql:106-111`
- proof: `placeSale` prices the basket *outside* the transaction
  (`const quote = await pricing.priceCheckout(checkout.id)`, line 200), and the
  quote reads the balance with a plain `LEFT JOIN auth.users u` - no `FOR
  UPDATE` (`sale_quote.sql:21-27`), producing
  `pre_charges_amount = LEAST(balance, base_total)`. Later, inside the
  transaction, it debits blind:

  ```ts
  if (quote.pre_charges_amount > 0) {
    await credit.removeFunds(checkout.user_id, quote.pre_charges_amount, tx)   // no re-read
  ```

  `removeFunds` -> `adjust_credit.sql`
  `SET dorado_funds = COALESCE(dorado_funds, 0) - $1` with no `WHERE
  dorado_funds >= $1` and no CHECK constraint. Confirmed against the local test
  database:

  ```
  SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='auth.users'::regclass;
   users_email_key | UNIQUE (email)
   users_pkey      | PRIMARY KEY (id)
  ```

  and, starting from 100:

  ```
  UPDATE auth.users SET dorado_funds = COALESCE(dorado_funds,0) - 100 ...   -- twice
   after_two_concurrent_debits
   -100
  ```

  Nothing anywhere in `place()` takes a row or advisory lock on the user, so two
  in-flight placements (a double-submit, or a sale plus an admin sale) each
  price a balance of $100 and each debit $100. `refuseNegativeBalance` exists
  (`credit/rules.ts:9`) but is only wired into `adjustDoradoCredit`, the admin
  edit path.
- fix: read the balance with `users.balanceForUpdate(user_id, tx)` inside
  `placeSale`'s transaction, recompute the applied credit from that value, and
  refuse if it no longer covers `pre_charges_amount`. A
  `CHECK (dorado_funds >= 0)` on `auth.users` would turn the remaining races
  into a rollback rather than a negative balance.

### F4 Credit is debited at placement and only a manual script gives it back [severity: money]

- where: `api/src/domains/orders/place.ts:240-249`,
  `api/src/domains/transactions/sweeps.ts:52-66`,
  `api/src/shared/cron/scheduler.ts:15-35`, `api/package.json:54`
- proof: a sale is written `Pending` with the customer's credit already
  subtracted (`statusAtPlacement(cents, false) === 'Pending'`,
  `orders/rules.ts:74`; the debit is committed in the same transaction). The
  only thing that returns that credit is `sweepAbandoned` -> `cancelPendingSale`
  -> `credit.addFunds`. The cron registers exactly three jobs - `spot prices`,
  `anonymous visitors`, `settle paid orders` (`scheduler.ts:15-35`) - and
  `sweepAbandoned` is in none of them. Its only production caller is
  `api/scripts/reconcile-payments.ts:45`, run by hand through
  `pnpm --filter @dorado/api reconcile:payments --commit`. So a customer who
  abandons the card step after placement loses the credit portion until somebody
  remembers to run a script.
- fix: register `sweepAbandoned(TTL_HOURS)` as a fourth cron job beside
  `settle paid orders`, gated by its own schedule env var, or do not debit the
  credit until the payment settles.

### F5 The Stripe idempotency key outlives the intent it names, so the second checkout in a session breaks [severity: data]

- where: `api/src/domains/transactions/service.ts:81-93`,
  `api/src/db/payments/intents/sql/find_reusable.sql:38`,
  `api/src/db/payments/attempts/sql/create.sql`
- proof: the key is `intent:${type}:${target.id}:${caller.session_id}` -
  stable for the whole better-auth session, and Stripe replays a key for 24
  hours. But `findReusable` deliberately excludes resolved intents:

  ```sql
  AND i.status NOT IN ('succeeded', 'processing', 'canceled')
  ```

  So once the customer's intent succeeds (or is cancelled by
  `cancelPendingSale` / `cancel_payment_intent`), the next
  `retrieve_payment_intent` or `update_payment_intent` in the same session finds
  nothing to reuse, calls `stripe.createIntent` with the **same** key, and gets
  the old resolved PaymentIntent back. `recordIntent` then inserts a second
  `payments.intents` row and a second `payments.attempts` row carrying the same
  `provider_ref`, which the schema forbids. Reproduced on the local test
  database:

  ```
  CREATE UNIQUE INDEX attempts_provider_ref_key ON payments.attempts USING btree (provider_ref)
  ...
  ERROR:  duplicate key value violates unique constraint "attempts_provider_ref_key"
  DETAIL:  Key (provider_ref)=(pi_REPLAY) already exists.
  ```

  Even if the insert succeeded, the `client_secret` handed back belongs to a
  succeeded or cancelled intent that Stripe will not confirm - which is the
  symptom FOLLOWUPS records under the $126.48 entry ("a checkout that fails at
  the last step because the API offers back an intent Stripe will not confirm").
  `providers/payment/tests/stripe-cassettes.test.ts:15` proves the key holds at
  the Stripe level and never exercises `recordIntent` twice, so the suite is
  green.
- fix: make the key unique per intent attempt (include a fresh uuid minted in
  `createPaymentIntent`, or the checkout id plus a nonce), so a replay only
  covers a genuine network retry of the *same* attempt. `recordIntent` should
  additionally upsert on `provider_ref` rather than plain-inserting.

### F6 `payments.intents.type` is NOT NULL and the repo writes null - a typeless call mints a live Stripe intent and then 500s [severity: data]

- where: `api/src/domains/transactions/controller.ts:65-69`,
  `api/src/domains/transactions/service.ts:81-93`,
  `api/src/db/payments/intents/repo.ts:28`
- proof: `retrievePaymentIntent` passes `oneString(req.query.type)`, which is
  `undefined` when the caller omits `?type=`. `recordIntent` passes
  `type: type ?? null` into `intents.create`, which binds `row.type ?? null`.
  The column is `type text NOT NULL` with no default
  (`000_genesis_schema.sql`, `payments.intents`). Reproduced:

  ```
  INSERT INTO payments.intents (session_id,user_id,type,status,amount_expected,...) VALUES (NULL,NULL,NULL,...);
  ERROR:  null value in column "type" of relation "intents" violates not-null constraint
  ```

  The order of operations is what makes this a data finding rather than a 500:
  `stripe.createIntent` runs *before* `withTransaction(recordIntent)`, so the
  PaymentIntent exists at Stripe with a customer attached and there is no local
  row for it at all. That is the shape of FOLLOWUPS' "two further charges have
  no row at all". `chain6` shows only two type values in the wild
  (`sales_order_checkout` 19, `admin` 6), so today's frontend always sends one -
  the endpoint accepts the call regardless, and every test passes an explicit
  type.
- fix: parse `type` with a contract that requires it (a `z.enum` of the two
  values) at the controller, and drop the `?? null` in `intents/repo.ts create`
  so the type is a required argument.

### F7 Nothing compares what Stripe took to what the order costs before marking it paid [severity: money]

- where: `api/src/domains/transactions/webhook.ts:29-39`,
  `api/src/domains/transactions/sweeps.ts:13-21`,
  `api/src/db/orders/sql/find_sales_awaiting_settled_intent.sql`,
  `api/src/db/payments/intents/sql/find_facts_by_ref.sql:8`
- proof: the paid transition is keyed on status alone:

  ```ts
  if (paymentIntent.status === 'succeeded' && prior?.payment_status !== 'succeeded'
      && prior?.direction === 'sale' && prior?.order_id) {
    await withTransaction((tx) => ordersRepo.update(prior.order_id!, { status: 'Preparing' }, {}, tx))
  ```

  `paymentIntent.amount_received` is used only to decide whether to write a
  settlement row (`service.ts:147`); it is never compared with
  `orders.transactions.post_charges_amount`. `find_facts_by_ref.sql` even
  projects `round(i.amount_expected * 100) AS amount` and `applyIntentEvent`
  ignores it. The sweep is the same - `find_sales_awaiting_settled_intent.sql`
  filters `i.status = 'succeeded'` and no amount. The reachable case: the client
  holds a `client_secret` whose amount was set by `update_payment_intent`, and
  `placeSale` re-sets the amount by calling `world.authorize` **after** its
  transaction commits (`place.ts:258`); a client that confirms before that
  update lands pays the earlier amount, and the order is still marked
  `Preparing`. Not reproduced end to end - it needs a live Stripe confirm race.
- fix: in `applyIntentEvent` and `sweepSettledIntents`, refuse to advance the
  order unless `toDollars(amount_received) >= transactions.post_charges_amount`
  for that order, and report the mismatch rather than silently advancing.

### F8 A ban, a revoked session or a role change keeps working for five minutes [severity: authz]

- where: `api/src/domains/accounts/auth/client.ts:47`
  (`session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }`),
  `api/src/shared/middleware/authMiddleware.ts:16-26`
- proof: with `cookieCache.enabled`, better-auth 1.6.9's session route returns
  the session and user **from the signed cookie without a database read** for as
  long as the cached payload is valid
  (`better-auth/dist/api/routes/session.mjs:93-175` - the branch returns
  `ctx.json({session: parsedSession, user: parsedUser})` straight from
  `sessionDataPayload`). `banUser` does revoke sessions server-side
  (`plugins/admin/routes.mjs:465` `internalAdapter.deleteSessions`), and the
  admin plugin's ban check only runs on `session.create`
  (`plugins/admin/admin.mjs:33-53`) - i.e. at sign-in. So for up to five minutes
  after a ban, a session revocation, or a demotion from `admin`, the cached
  cookie still satisfies `requireAuth`, and `requireRole` reads `req.user.role`
  from that same cached object, so `requireAdmin` still passes. `requireAuth`
  itself never looks at `banned` or `banExpires`.
- fix: either drop `cookieCache` on this API (it saves one indexed lookup per
  request), or set `cookieCache.version` to something that changes on ban/role
  writes, and have `requireAuth` refuse a user whose `banned` is true.

### F9 One un-deletable visitor stops the anonymous sweep permanently [severity: data]

- where: `api/src/db/users/anonymous/sql/delete.sql`,
  `api/src/domains/checkout/sweep.ts:20-26`
- proof: the sweep collects up to `BATCH = 5_000` stale ids and deletes them in
  a **single** statement, `DELETE FROM auth.users WHERE id IN (SELECT id FROM
  victims)`, after clearing only `checkout.checkouts`, `places.user_addresses`,
  `auth.sessions` and `auth.account`. Anonymous visitors satisfy `requireUser`
  (the anonymous plugin gives them `role: 'user'`), so they can reach
  `POST /api/images` and `GET /api/stripe/retrieve_payment_intent`. Both write
  rows that reference `auth.users` with `ON DELETE NO ACTION` and are not
  cleared by the sweep - confirmed against the local schema:

  ```
  media.images        | user_id       | a
  payments.intents    | user_id       | a
  payments.intents    | created_by_id | a
  payments.ledger     | user_id       | a
  ```

  One such visitor raises 23503, the whole `withTransaction` rolls back, and
  because the batch is a single statement no visitor is deleted at all. The cron
  logs it and carries on (`scheduler.ts:37-50`), so the sweep never makes
  progress again.
- fix: delete per visitor (or `WHERE NOT EXISTS` the referencing tables in
  `victims`), and decide explicitly what happens to an anonymous visitor's
  `payments.intents` and `media.images` rows.

### F10 `find_reusable` can never match a null type, so a typeless caller mints an intent per request [severity: rule]

- where: `api/src/db/payments/intents/sql/find_reusable.sql:37`
  (`AND i.type = $3`), `api/src/domains/transactions/service.ts:29-41`
- proof: `findReusableIntent` passes `type ?? null`. `i.type = NULL` is UNKNOWN,
  never true. Confirmed: `SELECT count(*) FROM payments.intents i WHERE i.type =
  NULL` returns 0. So with no `?type=`, the "reuse an open intent" branch is
  dead and every call falls through to `createPaymentIntent`, which is how F5
  and F6 get reached in the first place.
- fix: `AND i.type IS NOT DISTINCT FROM $3`, or make `type` required (F6) so the
  null case cannot arise.

### F11 The order-confirmation email is lost on the webhook's own retry [severity: rule]

- where: `api/src/domains/transactions/webhook.ts:23-39`
- proof: `prior` is read first, then `updateFromProvider` **commits** the
  succeeded status, then the order is set `Preparing` in a second committed
  transaction, and only then `await world.confirm(prior.order_id!)` sends the
  mail. If the send throws, the handler throws, the webhook answers 500, and
  Stripe redelivers - but now `findIntentByRef` returns
  `payment_status = 'succeeded'`, the `prior?.payment_status !== 'succeeded'`
  guard is false, and the confirmation is never sent. The order is correct; the
  customer is never told. The same read-then-act shape means two concurrent
  deliveries of `payment_intent.succeeded` both see the stale `prior` and both
  send the mail.
- fix: record the confirmation as a fact (a `media.emails` row keyed by order +
  kind is already the table for it) and drive the send from "no confirmation row
  yet" rather than from the intent's prior status.

### F12 `payments.intents.details_id` and `method_id` are never written, so the payment-instrument panel is always empty [severity: rule]

- where: `api/src/domains/transactions/webhook.ts:51-67`,
  `api/src/db/payments/intents/sql/find_for_order.sql:30-40`,
  `api/src/db/payments/intents/sql/find_reusable.sql`
- proof: `recordInstrument` writes the card/bank instrument into
  `payments.details` and stops there. Grepping the whole tree, no non-test code
  ever passes `details_id` or `method_id` to `intents.create` or `intents.update`
  - `intents/repo.ts create` binds them from a patch nothing populates. Both
  view queries then join `LEFT JOIN payments.details d ON d.id = i.details_id`
  and build the `details` object from it, so `PaymentIntentView.details` is
  always `null` for anything this code created. `chain6` confirms the split: of
  25 intents, 3 carry `details_id` and 1 carries `method_id`, all January
  residue. `GET /api/stripe/get_sales_order_payment_intent` is the admin's
  "what did they pay with" read and it answers null.
- fix: have `recordInstrument` (or `applyIntentEvent`) set
  `intents.details_id`/`method_id` for the intent the payment method belongs to,
  in the same transaction as the details write.

### F13 `MediaUploadBody` lets `mime_type` be absent; the column is NOT NULL [severity: contract]

- where: `packages/contracts/src/media/images.ts:112-119`,
  `api/src/domains/accounts/images/controller.ts:7-15`,
  `api/src/db/media/images/sql/create.sql`
- proof: the contract is
  `Image.pick({mime_type, size_bytes, filename}).extend({ mime_type:
  Image.shape.mime_type.nullable().optional(), ... })`, the controller passes
  `body.mime_type ?? null`, and the column is NOT NULL with no default:

  ```
  mime_type   | NO          |
  ```

  `POST /api/images {"filename":"x.png"}` therefore 23502s as a 500 rather than
  a 400.
- fix: drop `.nullable().optional()` from `MediaUploadBody.mime_type` so the
  parse refuses at the boundary - the generated `Image` already types it
  required.

### F14 `POST /api/account/set_password` mints a credential from a session alone [severity: authz]

- where: `api/src/domains/accounts/auth/routes.ts:8`,
  `api/src/domains/accounts/auth/controller.ts:10-19`
- proof: the route is guarded by `requireAuth` only. better-auth 1.6.9's
  `setPassword` (`dist/api/routes/update-user.mjs:185-213`) refuses when a
  `credential` account with a password already exists
  (`PASSWORD_ALREADY_SET`), but for a user who signed in with Google or a magic
  link - or an anonymous visitor - there is no such account, so it calls
  `internalAdapter.linkAccount(...)` and the session gets a permanent password.
  No current-password check, no re-authentication, no session revocation
  afterwards. better-auth exposes this endpoint as server-only precisely
  because it skips the checks `changePassword` makes.
- fix: require a fresh session (better-auth's `sensitiveSessionMiddleware`
  freshness, or re-verify by email) and revoke the user's other sessions after
  the link; refuse it outright for `isAnonymous` callers.

### F15 The abandoned-sale sweep has no order-status filter and re-processes cancelled orders [severity: rule]

- where: `api/src/db/orders/sql/find_abandoned_sales.sql`,
  `api/src/domains/transactions/sweeps.ts:28-50`
- proof: the WHERE clause filters on direction, age, `post_charges_amount`,
  intent status and the absence of a Credit ledger row - never on
  `o.status`. So an order already set `Cancelled` by a previous run still
  matches on every subsequent run: `cancelPendingSale` re-writes
  `status = 'Cancelled'` and `cancelIntentByRef` calls Stripe again. The double
  refund is prevented (twice over: the `NOT EXISTS` on the ledger and
  `hasCreditFor`), so the cost is repeated Stripe calls and repeated writes
  rather than lost money - but an order that used no funds is swept forever.
- fix: add `AND o.status = 'Pending'` to `find_abandoned_sales.sql`.

## Verified correct (suspected and disproved)

- Bank numbers never reach the wire outside `GET /api/payments/details/:id/bank`
  (`requireAdmin`): `PaymentDetailsView`, `list_for_user.sql`, `get_many.sql`
  and `get_one.sql` project only `last_four`/`routing_last_four`, and the
  ciphertext columns are read exclusively by `get_sealed.sql` through
  `decryptFor`.
- The envelope binding is real: AAD is `${rowId}:${column}`, so a ciphertext
  moved to another row or column fails to open; `open()` compares key ids with
  `timingSafeEqual` before deriving anything; `seal('')` is refused.
- Logging cannot leak a payout: pino's `req` serializer emits `{method, url}`
  only, and no body reaches a log. `errorHandler`'s `toAppSafe` picks
  `message/name/code` and zod's messages carry no values, so a rejected payout
  form does not echo the numbers.
- A past order's recorded payout cannot be overwritten by the next one:
  `clear_for.sql` nulls `checkout.checkouts.payment_details_id` inside the
  placement transaction, so the next payout form creates a fresh
  `payments.details` row rather than updating the one
  `orders.transactions.payout_details_id` points at.
- Address ownership holds: every read and write in
  `accounts/places/addresses/service.ts` funnels through
  `userAddresses.view(user_id, address_id)` (`view.sql` is scoped by
  `ua.user_id = $1`) and `entry()` throws `NotFound` otherwise; the `?user_id=`
  override in `subjectOf` is gated on `req.user?.role === 'admin'`.
- Image ownership holds: `getUrlFor` and `deleteImage` both go through
  `ownedBy`, `delete.sql` is keyed `WHERE id = $1 AND user_id = $2`, the presign
  path is `${user_id}/`, the filename is sanitised to `[A-Za-z0-9._-]`, and the
  S3 object is removed after the transaction commits.
- A non-admin cannot reach another customer through the intent endpoints: with
  `type !== 'admin'`, `intentOwner`, `billingIdentity` and `assertIntentSubject`
  all resolve to `caller.user_id` and the body's `user_id` is ignored in every
  branch.
- `adjustDoradoCredit` is correct where it is used: `balanceForUpdate` really is
  `SELECT ... FOR UPDATE`, the read and the write share one transaction, and
  `movementBetween` writes exactly one ledger row per non-zero movement.
- A redelivered `payment_intent.succeeded` does not duplicate the settlement:
  `settlements/sql/create.sql` is `ON CONFLICT (id) DO UPDATE`, and the id is
  the attempt id.
- No statement in this area writes an `exchange` table, and no repo writes an
  audit column - `buildUpdate` throws on any of the six.
- `UpdateCreditBody` accepting a negative `amount` is not a defect: `subtract`
  of a negative is arithmetically an add, `refuseNegativeBalance` still gates
  the result, and `movementBetween` records the true direction.

## Simplifications (not bugs)

- `api/src/domains/accounts/images/service.ts:58` `getUrl(image_id)` has no
  callers and, unlike `getUrlFor`, no ownership check - the unowned twin of a
  function two lines below it. Delete it before someone routes to it.
- `isSettled`, `chargeCents` and `STRIPE_MINIMUM_CENTS` are defined twice, in
  `transactions/rules.ts:29,57,59` and `orders/rules.ts:60,64,68`, with
  identical bodies; `sale_quote.sql:163` spells the same 50-cent rule a third
  time in SQL.
- `transactions/rules.ts:67` `paymentSurface` has no production caller - only
  `tests/rules.test.ts:30-33`.
- `transactions/service.ts:185` calls `assertPriceableBalance` purely for its
  throw and discards the number it returns; the name says it computes something.
- `transactions/service.ts:145` discards `attempts.update`'s boolean while the
  line above it checks `intents.update`'s - the asymmetry is the
  `audit:silent-mutations` shape on the webhook path.
- `settlements.create(attempt_id, attempt_id, ...)` (`service.ts:148-157`) makes
  the settlement id the attempt id, so an attempt can only ever hold one
  settlement; a partial capture or a second charge overwrites it.
- `db/payments/intents/sql/find_open_for_user.sql` is scoped by user only - not
  by session or type - so `openIntentFor` can attach an admin-created intent to
  a customer's self-service order.
- `sale_quote.sql:22` hardcodes `COALESCE(pm.surcharge_percent, 0.029)` as a
  fallback for a missing payment-method row, putting the card rate in two places.
- `credit/controller.ts:9` reads the subject with `param(req, 'id')` rather than
  `uuidParam`, so `POST /api/users/not-a-uuid/credit` answers 500 (22P02)
  instead of 400.
- `shared/middleware/errorHandler.ts` is ~440 lines of terminal pretty-printing
  (chalk columns, stack parsing) sitting beside a configured pino logger that
  already formats and redacts.
