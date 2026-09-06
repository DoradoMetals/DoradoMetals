# money path review

Area: `api/src/domains/{orders,checkout,pricing}/**`, the SQL they read under
`api/src/db/{orders,checkout,pricing,rates,spots,tax,refiners}/**`, and
`packages/contracts/src/{orders,checkout,pricing,rates,spots,tax,refiners}`.

Everything below was checked against the migrated local database
`test_review_lane` (127.0.0.1:5544), which is at migration 133. **The plain
`test` database on the same cluster is stale (pre-132, `metal_id` still `uuid`)
and will produce false findings — do not review against it.** Production shape
was cross-checked read-only against the local `chain6` rebuild. No dev or
production database was touched.

## Findings (most severe first)

### F1 Editing any catalogue line on a purchase order applies purity twice and cuts the customer's payout  [severity: money]

- where: `api/src/domains/orders/service.ts:82-111` (`editLine`),
  `api/src/db/orders/items/sql/create_from_product.sql:4-5`,
  `api/src/db/checkout/items/sql/create_from_product.sql:4-5`
- proof:

  The snapshot writes the product's **fine** content into `post_melt`, beside
  its `purity`:

  ```sql
  -- create_from_product.sql, columns (…, pre_melt, post_melt, purity, content, …)
  SELECT gen_random_uuid(), $1, b.id, b.metal_id, b.gross, b.content, b.purity,
         b.content, 1, false, 't oz'
  ```

  `editLine` then re-derives `content` from `post_melt × purity` on **every**
  patch, unconditionally — the derivation is not gated on which fields changed:

  ```ts
  const weight = changes.post_melt !== undefined ? changes.post_melt : line.post_melt
  …
  const written = await itemsRepo.update(
    line_id, { content: fineContent(weight ?? preMelt, unit, purity) }, …)
  ```

  Reproduced through the real service against `test_review_lane` (temporary
  vitest file, since deleted):

  ```
  PRODUCT Gold American Eagle (1 oz) gross 1.091 content 1 purity 0.916
  ON CREATE                content = 1
  AFTER {confirmed:true}   content = 0.916      (-8.40 %)
  ```

  Same shape for every product where `gross <> content` (6 of 62 on dev, 10 of
  95 on the production rebuild):

  | product | content on create | content after any edit | change |
  |---|---|---|---|
  | Gold American Eagle (1 oz) | 1.0 | 0.916 | −8.40 % |
  | 90% Silver Bags | 0.9 | 0.81 | −10.00 % |
  | Gold Mexican 50 Peso | 1.2057 | 1.08513 | −10.00 % |

  The trigger is not exotic: `confirmed` is in `OrderItemPatch`, and
  `PATCH /api/orders/items/:id {"confirmed": true}` is the **required** step
  before `actionsFor` offers `finalize_pricing` (`orders/rules.ts:144`). So the
  normal admin lifecycle for a bullion line on a purchase order is
  add → confirm → finalize, and the confirm silently removes 8–10 % of the fine
  metal the customer is paid for. `finalizePricing` then writes
  `content × bid × premium` into `orders.items.price` and the order total, so
  the loss reaches the payout, the invoice and `add_funds`.

  Compounding it: `retiersAfterEdit` returns false for a `confirmed`-only edit,
  so the rate band is **not** recomputed even though the order's ounces just
  changed — the line keeps a band earned by ounces it no longer has.

  `docs/waves/handoff-2026-09-07.md:56-58` records the `post_melt = content`
  snapshot as a *future* hazard and states "Today's code stores `content`
  directly, so nothing is wrong now." That is the claim this reproduction
  disproves; `docs/model/lots.md:1216` calls the same thing "a defect the
  write-up found", but scoped to the lots redesign.
- fix: the snapshot should not put a fine weight in a gross-weight column —
  write `post_melt = NULL` (or `b.gross`) in both `create_from_product.sql`
  files, which makes `editLine`'s `weight ?? preMelt` fall through to
  `pre_melt = b.gross` and reproduce `content` correctly. Better still,
  `editLine` should only re-derive `content` when a weight/purity/unit field is
  actually in the patch — the same test `retiersAfterEdit` already applies.

### F2 The customer picks their own card surcharge, and their own payout fee  [severity: money]

- where: `api/src/domains/checkout/controller.ts:50-59` (`patchCheckout`),
  `packages/contracts/src/checkout/checkouts.ts:24-27` (`CheckoutPatch`),
  `api/src/db/pricing/sql/sale_quote.sql:22-26`,
  `api/src/domains/orders/rules.ts:97-99` (`payoutFeeOf`)
- proof:

  `PATCH /api/checkout` is `requireUser` only and accepts
  `payment_method_id: uuid`. Nothing anywhere validates that the row is a
  method of the checkout's own direction, that it is `enabled`, or that it
  agrees with `payment_details_id`. `sale_quote.sql` then reads the surcharge
  straight off whatever row the customer named:

  ```sql
  settlement AS (
    SELECT COALESCE(pm.surcharge_percent, 0.029) AS surcharge_percent, …
      FROM checkout LEFT JOIN payments.methods pm ON pm.id = checkout.payment_method_id
  ```

  Ran `sale_quote.sql` against `test_review_lane` on one identical sale basket,
  changing only `checkout.checkouts.payment_method_id`:

  ```
  payment_method_id = CARD   (surcharge_percent 0.029)
    base_total 8762.914  charges_amount 254.108  order_total 9017.022  payment_surface card
  payment_method_id = CREDIT (surcharge_percent 0)
    base_total 8762.914  charges_amount   0.000  order_total 8762.914  payment_surface card
  ```

  `payment_surface` stays `card`, so `placeSale` still opens a Stripe intent and
  charges the card — for $8,762.91 instead of $9,017.02. **$254.11 on one
  order**, entirely under customer control. The seeds give four zero-surcharge
  rows to choose from (`CREDIT`, sale `WIRE`, purchase `ACH`,
  `DORADO_ACCOUNT` — `047_seed_reference_data.sql:182-191`), including two that
  are `enabled = false`.

  The purchase side has the same hole with the sign reversed.
  `saveCheckoutPayout` sets `payment_method_id` from the saved payout details
  (`checkout/service.ts:125`), but the customer can overwrite it afterwards, and
  `placePurchase` charges the fee from **that** column:

  ```ts
  const payout_fee = rules.payoutFeeOf(
    await paymentMethods.listFor('purchase'), checkout.payment_method_id)
  ```

  while `create_for_purchase.sql` stores `payout_details_id` from
  `checkout.payment_details_id`, and `db/orders/sql/view.sql:102` reports the
  payout method from **the details row**. Save a WIRE payout, then patch
  `payment_method_id` to `DORADO_ACCOUNT`: the order says `method: WIRE`,
  `cost: 0`, and Dorado pays the $20 wire fee. (Reasoned from the code and the
  seed rows; not executed end to end.)
- fix: `payment_method_id` should not be a customer-writable column. Either drop
  it from `CheckoutPatch` and derive it (purchase: from `payment_details_id`;
  sale: from the surface the payment domain actually opened), or have
  `patchCheckout` refuse a method whose `direction` differs from the checkout's
  or whose `enabled` is false, in `checkout/rules.ts`.

### F3 Sales tax is charged in states where `reached_nexus` is false, and then accrued nowhere  [severity: money]

- where: `api/src/db/pricing/sql/sale_quote.sql:50-58`,
  `api/src/db/sales-tax/sql/accrue.sql`,
  `api/src/domains/pricing/service.ts:36-43`
- proof:

  The quote suppresses tax only when the env flag is **true**:

  ```sql
  CASE WHEN $2::boolean AND delivery.state IS NOT NULL
            AND NOT COALESCE((SELECT st.reached_nexus FROM tax.sales_tax
                               WHERE st.state::text = delivery.state), false)
       THEN 0 ELSE COALESCE(rule.tax_rate, 0) END AS sales_tax_rate
  ```

  `$2` is `process.env.COLLECTING_NEXUS_TAXES === 'true'`, and both `api/.env`
  and `api/.env.example` set it to **`false`**. So today tax is charged wherever
  a `tax.sales_tax_rules` row matches, nexus or not. The accrual does the exact
  opposite in the same request:

  ```sql
  UPDATE tax.sales_tax SET amount_owed = amount_owed + $1
   WHERE state = $2 AND reached_nexus = true
  ```

  Ran `sale_quote.sql` against `test_review_lane`, one silver coin delivered to
  Indiana (`tax.sales_tax.reached_nexus = false`):

  ```
  IN reached_nexus = false
  COLLECTING_NEXUS_TAXES=false (today)  item_total 75.69  sales_tax 5.30  rate 0.07
  COLLECTING_NEXUS_TAXES=true           item_total 75.69  sales_tax 0.00  rate 0
  ```

  `placeSale` calls `taxService.updateStateSalesTax(quote.sales_tax, …)` for
  that $5.30 and the UPDATE matches zero rows. **Both databases have
  `reached_nexus = false` for all 51 rows** (dev and the `chain6` production
  rebuild), with 88 rules across 51 states. So every sales-tax dollar the API
  currently collects is recorded as owed to nobody.
- fix: one of the two halves is wrong and Jacob has to say which. If the
  business collects only where it has nexus, the flag's sense is inverted (or
  the flag should go and the `reached_nexus` test become unconditional). If it
  collects everywhere the rules match, `accrue.sql`'s
  `AND reached_nexus = true` must go so the liability is recorded. Either way
  the two statements should read the same fact.

### F4 `POST /orders/:id/add_funds` has no idempotency guard and ignores the payout method  [severity: money]

- where: `api/src/domains/orders/service.ts:147-163`,
  `api/src/domains/orders/routes.ts:144`
- proof:

  The service's only guards are "the order exists", "it is a purchase" and "its
  total is not null":

  ```ts
  const amount = order.totals?.total ?? null
  rules.assertCreditable(amount, order.order.number)
  await withTransaction(async (tx) => {
    await credit.addFunds(order.order.user_id, amount, tx)
    await ledger.addTransactionLog({ …, type: 'Credit', order_id, amount }, tx)
  })
  ```

  Nothing marks the order as paid out, and `actionsFor.add_funds` stays true
  afterwards. Reproduced through the real service (temporary vitest file, since
  deleted) on a $500 order whose payout is **WIRE**:

  ```
  payout.method = WIRE   actions.add_funds = false
  after 1 call:  dorado_funds = 500
  after 3 calls: dorado_funds = 1500
  ledger = [Credit 500, Credit 500, Credit 500]
  ```

  Two defects in one: an admin double-click credits the customer again (a
  refresh/retry of an admin POST is enough), and the endpoint credits a Dorado
  balance for an order that is also going to be wired — the
  `creditsToAccount(payout.method === 'DORADO_ACCOUNT')` rule exists only in the
  advisory `actions` object, not in the service.

  The guard already exists three files away and is used by the sweep:
  `transactionsService.hasCreditFor(order_id)` (`transactions/sweeps.ts:40`,
  `transactions/ledger/service.ts:9`).
- fix: in `orders/service.ts` `addFunds`, refuse when
  `hasCreditFor(order_id)` is already true, and assert
  `rules.creditsToAccount(order.payout?.method ?? null)` — the same test
  `actionsFor` uses — both inside the transaction.

### F5 A purchase order cancelled before `finalize_pricing` returns the customer's metal uninsured  [severity: money]

- where: `api/src/domains/orders/service.ts:174-181` (`cancel`),
  `api/src/db/orders/transactions/sql/create_for_purchase.sql`
- proof:

  `cancel` insures the return parcel from the order's **stored total**:

  ```ts
  const declaredValue = await carrierServices.clampInsuredValue(
    shippingRules.declaredValue(order.totals?.total ?? 0), service.code)
  const insured = declaredValue > 0
  ```

  `create_for_purchase.sql` inserts only `(id, order_id, used_funds,
  payout_fee, payout_details_id)` — `orders.transactions.total` is **NULL from
  placement until `finalizePricing` runs**. `clampInsuredValue` returns 0 for a
  non-positive input (`shipping/services/service.ts:120`), so `insured = false`
  and `declared_value = null`, and the label is bought with no declared value on
  a parcel of the customer's gold. `actionsFor.cancel` is
  `purchase && address !== null` — it is offered from the moment the order is
  placed, long before finalize.

  The correct number is already computed and unused: `order_pricing.sql` emits
  `declared_value = scrap_total + bullion_total`, which is what
  `sealForPlacement` uses for the inbound label.
- fix: `cancel` should take its declared value from
  `pricing.priceOrder(order_id).declared_value`, not from
  `orders.transactions.total`.

### F6 The refiner's money is written outside a transaction, in up to seven statements  [severity: data]

- where: `api/src/domains/orders/refiners/orders/service.ts:8-44`,
  `api/src/domains/orders/refiners/items/service.ts:12-39`
- proof: `patchRefinerOrder` issues every write on its own pool connection with
  no `withTransaction`:

  ```ts
  for (const spot of patch.spots ?? []) await refinerSpotsRepo.update(order_id, spot.metal_id, { bid: spot.bid })
  if (patch.fee !== undefined) {
    await refinerOrdersRepo.update(id, { fee: patch.fee })
    await orderTransactions.update(order_id, { refiner_fee: patch.fee })
  }
  ```

  `refiners.orders.fee` and `orders.transactions.refiner_fee` are the same
  number stored twice, written in two separate autocommitted statements, and
  `profit_breakdown.sql` reads the second (`fees.refiner_fee`) while the admin
  UI reads the first. A failure between them leaves the margin report and the
  engagement disagreeing with nothing to reconcile them. `pool_oz_deducted` and
  `pool_remediation` have the identical pair. `patchRefinerItem` has the same
  shape with two writes.

  It also breaks migration 116's contract directly: `withTransaction` is what
  issues `set_config('app.actor_id', …)`, so every one of these money edits is
  stamped with no actor. CLAUDE.md states the rule twice ("Transactions use the
  helper", "every write goes through `withTransaction`").
- fix: wrap each service body in one `withTransaction`, passing `tx` to every
  repo call — the same shape `orders/spots/service.ts` `setSpots` already uses.

### F7 Customer credit is spent with no `FOR UPDATE` and no floor  [severity: data]

- where: `api/src/domains/orders/place.ts:200-256`,
  `api/src/domains/transactions/credit/service.ts:51-58`,
  `api/src/db/users/sql/adjust_credit.sql`
- proof: `placeSale` reads the balance in the quote **outside** the transaction
  (`const quote = await pricing.priceCheckout(checkout.id)`, line 200 —
  `sale_quote.sql` reads `auth.users.dorado_funds` with a plain LEFT JOIN), then
  eighty lines later subtracts that number inside a transaction that never
  re-reads it:

  ```ts
  if (quote.pre_charges_amount > 0) {
    await credit.removeFunds(checkout.user_id, quote.pre_charges_amount, tx)
  ```

  `removeFunds` → `adjust_credit.sql` is an unconditional
  `dorado_funds = COALESCE(dorado_funds,0) - $1` with no `WHERE dorado_funds >=
  $1` and no returned check. The admin path does it correctly, in the same
  domain: `adjustDoradoCredit` takes `users.balanceForUpdate` (`SELECT …
  FOR UPDATE`) and calls `refuseNegativeBalance` before writing
  (`credit/service.ts:17-24`). Placement uses neither.

  Not reproduced under concurrency. The window is real but narrow: a checkout
  is unique per (user, direction) and `fulfillments.update`'s
  `whereNull: ['order_id']` blocks a second placement of the same basket, so
  the racing writer has to be `adjustDoradoCredit` or the abandoned-sale refund
  landing between the quote and the commit. The floor is missing regardless of
  the race — if the two ever disagree, `auth.users.dorado_funds` goes negative
  and nothing notices.
- fix: `placeSale` should read the balance with `users.balanceForUpdate` inside
  its own transaction and re-clamp `pre_charges_amount` against it, or
  `removeFunds` should carry `refuseNegativeBalance` the way the admin edit
  does.

### F8 The abandoned-sale sweep has no caller, so reserved credit is never returned  [severity: rule]

- where: `api/src/domains/transactions/sweeps.ts:52-66`,
  `api/src/shared/cron/scheduler.ts:15-35`,
  `api/src/db/orders/sql/find_abandoned_sales.sql`
- proof: `grep -rn "sweepAbandoned" api/src` outside `tests/` returns only its
  own definition. The scheduler declares three jobs — spot prices, anonymous
  visitors, settled intents — and no abandoned-sale job; no route calls it
  either. A sale placed `Pending` whose card charge never settles therefore
  keeps its `orders.transactions.funds` deducted from
  `auth.users.dorado_funds` forever, with no Credit ledger row, and the order
  sits `Pending` indefinitely. The whole refund path (`cancelPendingSale`'s
  `hasCreditFor` guard, `find_abandoned_sales.sql`'s TTL and its
  `NOT EXISTS (… ledger … 'Credit')` clause) is written and unreachable except
  through `place.ts`'s `supersede` branch.

  Separately, `find_abandoned_sales.sql` has **no `status` predicate** — it
  selects on `direction`, age, `post_charges_amount` and intent status only.
  Given the known unreliability of the payment webhook (CLAUDE.md: "Production
  has no record of $126.48 it was paid"), an order whose `payments.intents.status`
  is stale at `requires_payment_method` while Stripe actually captured would be
  cancelled and its intent cancelled — even if it had already advanced to
  `Preparing` or `In Transit`.
- fix: add the sweep to `scheduler.ts` behind its own schedule variable, and add
  `AND o.status = 'Pending'` to `find_abandoned_sales.sql` so it can only touch
  orders that never advanced.

### F9 The purchase quote has no `unpriceable`, so a metal with no bid quotes a $0 payout  [severity: rule]

- where: `api/src/db/pricing/sql/purchase_quote.sql:58`,
  `api/src/domains/pricing/service.ts:44-48`,
  `packages/contracts/src/pricing/quotes.ts:121-137`
- proof: `spots.spots.bid` is nullable (`ask` is `NOT NULL`; checked on
  `test_review_lane`). `purchase_quote.sql` swallows a null bid:

  ```sql
  t.content * (COALESCE(t.bid, 0) * COALESCE(t.band_pct, t.stored_premium, 0)) AS unit_price
  ```

  and `PurchaseQuote` has no `unpriceable` field, so `priceCheckout` only calls
  `assertPriceable` for sales:

  ```ts
  if (quote.direction === 'sale') rules.assertPriceable(quote.unpriceable, …)
  ```

  A sell basket containing that metal quotes `$0.00` for those lines and a
  correspondingly low `estimated_payout`, with a 200 and no warning. The
  placement path is protected — `order_pricing.sql` does emit `unpriceable` for
  `stored_price IS NULL AND bid IS NULL` and `retierPremiums` throws — so the
  damage is a lying quote rather than a lost order, but the customer decides to
  ship metal on that number.
- fix: give `purchase_quote.sql` the same `unpriceable` array
  `order_pricing.sql` has (`bid IS NULL`), add it to `PurchaseQuote`, and drop
  the `direction === 'sale'` condition in `priceCheckout`.

### F10 `orders.spots.ask` is frozen at placement and never refreshed, so a finalised order's documents print two different days  [severity: rule]

- where: `api/src/db/orders/spots/sql/freeze.sql`,
  `api/src/db/orders/spots/sql/set_bids_from_feed.sql`,
  `api/src/db/pricing/sql/order_pricing.sql:27-38`
- proof: `freeze.sql` copies `ask` and `bid` from the live feed at placement.
  `set_bids_from_feed.sql` — the statement `finalizePricing` and the spots PUT
  run when locking — updates `bid` only:

  ```sql
  UPDATE orders.spots os SET bid = CASE WHEN $2::boolean THEN (SELECT s.bid …) ELSE NULL END
  ```

  So once `spots_locked` is true, `order_pricing.sql`'s `metal_spots` returns
  `os.bid` from the finalize day and `os.ask` from the placement day. The
  contract comment (`pricing/quotes.ts:194-196`) and the SQL comment both say
  both numbers are "resolved the same way"; they are not. Both PDF and email
  invoices print `spot.ask` as the order's spot
  (`documents/pdfs/service.ts:431-437`,
  `documents/emails/utils/renderEmail.ts:107-115`), so a purchase invoice shows
  a stale ask next to a payout computed from a fresh bid.
- fix: `set_bids_from_feed.sql` should refresh `ask` alongside `bid` (and clear
  both on unlock), which also makes `cancel`'s per-metal bid clearing
  unnecessary — see Simplifications.

### F11 `sweepSettledIntents` advances orders on the pool, outside any transaction  [severity: data]

- where: `api/src/domains/transactions/sweeps.ts:13-21`,
  `api/src/shared/cron/scheduler.ts:32`
- proof: the cron calls `sweepSettledIntents()` with no executor, so each
  `orders.update(c.order_id, { status: 'Preparing' }, {}, undefined)` runs
  autocommitted on the pool. Migration 116's `audit_stamp` trigger reads
  `app.actor_id`, which only `withTransaction` sets, so every status advance the
  reconciler makes is stamped with no actor; and a batch that fails halfway
  leaves some orders advanced and some not, with no record of which run did it.
  The `executor?` parameter exists but the only production caller omits it.
- fix: wrap the loop in `withTransaction` and pass the client, as
  `sweepAbandoned` already does per order.

### F12 `finalizePricing` does not enforce the rule that gates it  [severity: rule]

- where: `api/src/domains/orders/service.ts:126-145`,
  `api/src/domains/orders/rules.ts:144`
- proof: `actionsFor` offers `finalize_pricing` only when
  `allLinesConfirmed(view.items)`, but the service checks direction alone:

  ```ts
  const order = await viewOf(order_id)
  rules.assertDirection(order.order.direction, 'purchase', 'finalizing pricing')
  ```

  `POST /api/orders/:id/finalize_pricing` on an order with unconfirmed lines
  locks the spots and writes `orders.items.price` and the order total from
  declared, unverified weights. It is also re-runnable: a second call re-prices
  at the already-locked bids, which is harmless, but a call after an unlock
  re-prices at a different day's spot with no record that it moved.
- fix: assert `rules.allLinesConfirmed` in `finalizePricing`, so the advertised
  action and the endpoint agree.

## Verified correct (suspected and disproved)

- A customer **cannot** point `recipient_address_id` at someone else's address:
  `checkout.checkouts` carries `checkouts_recipient_address_theirs_fk` on
  `(user_id, recipient_address_id)` into `places.user_addresses` — the insert is
  refused by the database (hit while building the F3 fixture).
- Double-placing one checkout is blocked atomically: `fulfillments/repo.ts`
  `update` adds `whereNull: ['order_id']` when the patch names `order_id`, and
  `assertDraft` turns the zero-row update into a 409. Nothing else is needed to
  stop a duplicate order, credit deduction or Stripe charge.
- `orders.transactions` and `orders.addresses` are one-per-order
  (`transactions_one_per_order`, `addresses_one_per_order`, both UNIQUE), so the
  scalar subqueries in `db/orders/sql/view.sql` and the `payout` CTE in
  `order_pricing.sql` cannot raise 21000 or multiply rows.
- The premium precedence really is inverted between the two quotes on purpose —
  `purchase_quote.sql` takes `COALESCE(band, stored, 0)` and
  `order_pricing.sql` takes `COALESCE(stored, band, 0)` — and
  `docs/waves/pricing.md:112-124` gives the reason (an admin's hand-edited
  premium must not be overruled; a basket's premium must not go stale).
- The rate band's boundary behaviour is deliberate: a total sitting exactly on a
  boundary takes the **lower** band, a total below every band takes the lowest,
  and one in dev's real 20–23 oz gold gap takes the highest. Documented in
  `docs/waves/pricing.md:60-66`, and the `ORDER BY` reproduces it.
- `array_position(ARRAY['Gold','Silver','Platinum','Palladium'], metal_id)` in
  `order_pricing.sql` and `db/spots/sql/get_all.sql` still resolves —
  `metal_id` became `text` in migration 132. It raises 42883 only on the stale
  local `test` database. All four pricing SQL files `PREPARE` clean against
  `test_review_lane`.
- Every irreversible side effect in this area is outside its transaction:
  `buyLabel` and `confirm` after the commit in `placePurchase`, `authorize` and
  `confirm` after it in `placeSale`, `buyReturnLabel` after it in `cancel`, the
  refiner email after it in `sendToRefiner`.
- `product_quote.sql` does not COALESCE `s.ask` where it does COALESCE `s.bid`,
  but `spots.spots.ask` is `NOT NULL`, so `ProductQuote.unit_price` (a required
  `z.number()`) cannot be handed a null.
- `providers/spots/feed.ts` skips any quote with a null bid or ask, so the cron
  never writes `spots.spots.bid = NULL` — which is what keeps F9 latent rather
  than live.
- `RefinerView.created_at`/`updated_at` being the **organization's** timestamps
  in `db/refiners/orders/sql/view_for_order.sql` is not a copy/paste slip:
  `refiners.refiners` has no timestamp columns and the contract declares them as
  `Organization.shape.created_at` on purpose.
- `withTransaction` and the `tx` third argument are threaded correctly through
  the placement path: `writeOrder`, `retierPremiums`, `priceOrder`,
  `freezeForOrder`, `mirrorForOrder` and `sealForPlacement` all receive and pass
  the caller's client.

## Simplifications (not bugs)

- `OrderViewItem.payable` (`db/orders/sql/view.sql:18-20`) is
  `content × premium` — a fraction of an ounce with a money name, missing the
  spot entirely. `grep` finds no consumer in `api/` or `frontend/src`; only two
  tests assert the formula. Either it is `content × bid × premium` or it should
  go.
- `purchase_quote.sql`'s `declared_value` (`LEAST(total, ceiling)`, plus the
  whole `ceiling` CTE) is never read: `sealForPlacement` clamps `quote.total`
  itself through `clampInsuredValue`. Two insurance ceilings, one used.
- `orders/service.ts` `cancel` clears the frozen bids one metal at a time in a
  loop, when `orderSpots.setBidsFromFeed(order_id, false, tx)` is the single
  statement written for exactly that (`no-dictionaries.md` §"orders/spots").
- `checkout/service.ts` `replaceItems` writes the quoted premium back onto
  `checkout.items.premium` for purchases, and `purchase_quote.sql` then prefers
  the live band over it — so the stored value is a cache nothing reads.
  `docs/model/lots.md:1208-1211` reaches the same conclusion.
- `checkoutState`'s `missing[]` and `actionsFor`'s booleans are two decision
  surfaces, and F4/F12 are both cases of a service not enforcing what its own
  `actions` object advertises. The pattern is worth one rule rather than one
  per endpoint.
- `db/spots/sql/get_all.sql` and `order_pricing.sql` still carry the hardcoded
  four-metal name list that ruling 79 removed everywhere else; a fifth metal
  sorts last in both.
