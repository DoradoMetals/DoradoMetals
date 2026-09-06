# Money-path fixes, lane A (2026-09-05)

Findings 4, 5, 6, 7, 9, 10, 18, 29, 30, 31 of `docs/reviews/README.md`, plus
finding 8 pinned as found. Worktree `dorado-lanes/fixa`, branch `fixa-lane`.
One migration: `api/migrations/134_one_definition_of_fine_content.sql`.

## What each finding got

### 4 — purity applied twice on confirm/edit of a bullion line [MP F1] — FIXED

**The decision.** Fine content has one owner per kind of line, and neither
kind derives it in TypeScript any more:

- **A catalogue line's content is a snapshot** of `products.bullion.content`,
  written once at create and never re-derived. `db/orders/items/sql/derive_content.sql`
  carries `AND bullion_id IS NULL`, so no caller can re-derive one by accident.
- **A scrap line's content is derived from `COALESCE(post_melt, pre_melt) x purity`,
  once, in SQL** — `metals.fine_content`, the only definition of the conversion.
- **`post_melt` is no longer the product's fine content.** Both
  `create_from_product.sql` files now write NULL there. A coin is not melted, and
  a fine weight sitting in a gross-weight column is what the old `editLine`
  multiplied the purity into a second time.

Every path was made to agree:

| path | content comes from |
|---|---|
| `orders/items/sql/create_from_product.sql` | `b.content` (snapshot) |
| `checkout/items/sql/create_from_product.sql` | `b.content` (snapshot) |
| `orders/items/sql/create.sql` (declared lot) | `metals.fine_content(...)` |
| `checkout/items/sql/create.sql` | `b.content` for a bullion line, `metals.fine_content(...)` for a scrap line — one CASE, one rule |
| `editLine` (`orders/service.ts`) | `itemsRepo.deriveContent`, scrap only |
| `create_bought.sql` / `create_sold.sql` | copied from the basket line (still a snapshot) |
| refiner assay (`orders/refiners/items`) | `refinerItemsRepo.deriveContent` |

`rules.declaredLot` and `checkout/rules.scrapLine` no longer compute content;
`itemsRepo.create` and `checkoutItems.create` no longer take it. `fineContent`
is deleted from `shared/utils/convertWeights.ts` — nothing in TypeScript
computes a payable weight now.

MP F1's compounding note ("`retiersAfterEdit` returns false for a
`confirmed`-only edit, so the band is not recomputed even though the ounces just
changed") needs no separate fix: a confirm no longer changes the ounces, so
there is nothing to re-tier. `retiersAfterEdit` is unchanged.

`editLine` was rewritten from the logic rather than patched: it writes the
patch, asserts the row that results is weighable, and derives the content from
that row in one statement. The three merge ternaries are gone.

**Pins:** `orders/tests/edit-line.test.ts` — "confirming a catalogue line
leaves its content alone" (creates a real gold product whose purity < 1 and
whose gross differs from its content, confirms it, and asserts the content is
still the product's, then does the same for a premium, a quantity and an
unconfirm); "a scrap line still derives its content, from the weights the row
ends up with"; "a scrap line cannot be edited into a unit nobody quotes in".
`db/checkout/items/tests/repo.test.ts` and
`checkout/tests/checkout-items-http.test.ts` now assert `post_melt IS NULL` on a
catalogue line.

### 5 — credit spent with no lock and no floor [MP F7, MI F3] — FIXED (my half)

`placeSale` now re-reads the balance with `usersRepo.balanceForUpdate` **inside**
the placement transaction and refuses through `rules.assertCreditCovers` when it
no longer covers what the quote applied. It refuses rather than silently
re-clamping, because the quote's `order_total` and the Stripe amount have
already been computed from the balance it read.

Schema half: `CHECK (auth.users.dorado_funds >= 0)` in migration 134, guarded by
the same `IF NOT EXISTS` idiom genesis uses (dev already carried the constraint —
see "What lane B must do").

**Pins:** `orders/tests/rules.test.ts` "a balance that no longer covers what the
quote applied is refused"; `transactions/credit/tests/funds.test.ts` and
`db/users/tests/repo.test.ts` — both used to **assert the balance went negative**
and now assert the database refuses and the balance is unchanged.

### 6 — `add_funds` not idempotent, ignores the payout method [MP F4, MI F2] — FIXED

`orders/service.ts addFunds` now asserts `rules.assertPayableToAccount` (the
payout method is `DORADO_ACCOUNT`) before the transaction, and
`rules.assertNotAlreadyCredited(await ledger.hasCreditFor(order_id, tx))` inside
it — the same guard `cancelPendingSale` uses, read on the transaction that
writes the ledger row. A second POST answers 409.

`actionsFor.add_funds` turns itself off: `db/orders/sql/view.sql` gained a
`credited` fact (`EXISTS (… payments.ledger … type = 'Credit')`), declared on
`OrderViewFacts`.

**Pins:** `orders/tests/add-funds.test.ts` — "a second add_funds is refused, and
the action turns itself off" (one ledger row, balance moved once) and "an order
being paid out by wire is not credited to a Dorado balance"; plus the rules unit
test. The sell journey now asserts its ACH order is refused, and the purchase
lifecycle asserts `add_funds` flips true → false across the credit.

### 7 — the checkout accepts any payment_method_id [MP F2] — FIXED

`checkout/rules.assertSettlementMethod`, called from `patchCheckout` whenever the
patch names a method: the row must exist (404), be of the checkout's own
direction, be `enabled`, and agree with the method of the payout account the
checkout already holds (so the WIRE-payout / DORADO_ACCOUNT-fee swap is refused).

The quotes read only a valid one:

- `sale_quote.sql`: the surcharge join now requires `pm.enabled`,
  `pm.direction = 'sale'` **and `pm.provider IS DISTINCT FROM 'internal'`**.
  Direction and enabled alone do not close this: `CREDIT` is an enabled sale
  method with surcharge 0 that settles from the balance the quote has *already*
  applied as `pre_charges_amount`, so naming it waived the whole surcharge while
  `payment_surface` stayed `card` and Stripe still charged the card — the $254
  the reviewer measured. A method that cannot take the charge does not set its
  surcharge; the row falls through to the 0.029 default.
- `purchase_quote.sql`: the payout-fee join requires `pm.enabled` and
  `pm.direction = 'purchase'`.

**Pins:** `checkout/tests/checkout-row.test.ts` — "a payment method of the wrong
direction, or a disabled one, is refused" and "a payment method that disagrees
with the saved payout account is refused"; `pricing/tests/sale-settlement.test.ts`
— "a method that cannot take the charge does not set its surcharge".

### 8 — sales tax where nexus is false [MP F3] — PINNED, NOT FIXED

Jacob's decision, untouched. `pricing/tests/sales-tax.test.ts` gains
`FINDING MP F3: tax is charged where nexus is false, and accrued nowhere`, which
asserts today's behaviour on a state with `reached_nexus = false`: the quote
charges tax, and `updateStateSalesTax` moves `amount_owed` by nothing. The test
says in its header that it should be changed deliberately when the decision is
made, not repaired when it fails.

### 9 + 10 — conversion constants and `fineContent` [MA F10, MA F4] — FIXED

`metals.fine_content(weight, unit, purity)` is the one definition:
`31.1034768 g` per troy ounce and `175/12` troy ounces per pound. It returns
NULL when the weight or the purity is NULL (a lot with no weights has no
content, which is not an error) and **raises `invalid_parameter_value` on a unit
it does not know**, so a `content = 0` can no longer be persisted against a
parcel of real metal.

The refusal also happens at the domain edge, so the customer and the admin get a
422 rather than a 500: `assertWeighable` in `orders/rules.ts`,
`checkout/rules.ts` and `orders/refiners/items/rules.ts`, each testing the unit
against the new `WeightUnit` contract enum (`packages/contracts/src/metals/metals.ts`)
case-insensitively, exactly as the SQL lowercases.

`metals.convert_to_troy_oz` is **dropped** (MA F13) — it had no caller but the
test that certified its divergence, and that test is gone with it.
`convertTroyOz`/`convertToPounds` stay in `shared/utils/convertWeights.ts` with
the corrected constants; they size a parcel, not a payout, and the frontend
mirror (`frontend/shared/utils/convertWeights.ts`) was updated identically so
`shared/tests/mirror.test.ts` still holds. `logistics/shipping/tests/rules.test.ts`
had `453.592` as its "one pound" input and now has `453.59237` — the only edit
this lane made inside lane C's folder, and it is the input to my own constant.

**Pins:** `shared/utils/tests/convertWeights.test.ts`, rewritten: a pound is
`175/12` and explicitly *not* the old `14.5833105`; the SQL values every unit;
an unrecognised or missing unit is refused for `kg`, `ozt`, `oz t`, `troy_oz`,
`' g '` and `''`; a NULL weight or purity is NULL and not an error. Plus
`refiner-edits.test.ts` "an assay in a unit nobody quotes in is refused, not
valued at zero".

### 18 — refiner money written outside a transaction [MP F6] — FIXED

`orders/refiners/orders/service.ts` and `orders/refiners/items/service.ts` each
wrap their whole body in one `withTransaction` and thread `tx` through every
repo call, so the fee / pool ounces / pool remediation pairs (engagement row and
`orders.transactions`) can no longer disagree, and every one of these money
edits is stamped with an actor by migration 116's trigger.

`assayedRow` lost its injected `contentOf` function argument — the content is
derived by SQL afterwards, and `rules.assertContentDerived` looks at the row
count — and the "does this patch report an assay" test moved into
`rules.reportsAnAssay`.

**Pin:** `orders/tests/refiner-edits.test.ts` "an engagement PATCH that fails
part-way writes none of the money" — a body carrying a fee and a `refiner_id` no
refiner owns; the FK violation on the last write must undo the fee on both rows.

### 29 — purchase quote has no `unpriceable` [MP F9] — FIXED

`purchase_quote.sql` emits the same `unpriceable` array `order_pricing.sql` has
(a line whose metal has no live `bid`), `PurchaseQuote` declares it, and
`pricing/service.priceCheckout` calls `assertPriceable` for both directions
instead of only for sales.

**Pin:** `pricing/tests/sale-settlement.test.ts` "a sell basket whose metal has
no live bid is refused, not quoted at zero".

### 30 — `orders.spots.ask` frozen and never refreshed [MP F10] — FIXED

`orders/spots/sql/set_bids_from_feed.sql` now moves `ask` with `bid`: both take
today's feed on lock and both clear on unlock. That also made `cancel`'s
per-metal clearing loop redundant. Locking and unlocking are now one function -
`orders/spots/service.ts applyLock(order_id, locked, tx)` - which writes
`spots_locked`, runs the one statement and reports a reprice that matched no
row; `setSpots`, `finalizePricing` and `cancel` all go through it, so the row
count is observed everywhere (`audit:silent-mutations` stays at its ceiling of
14).

**Pin:** `orders/tests/finalize-pricing.test.ts` "finalizing refreshes the frozen
ask alongside the bid" — moves the live feed after placement, finalises, and
asserts every frozen row's ask AND bid equal the feed.

### 31 — `finalizePricing` does not enforce its gate [MP F12] — FIXED

`rules.assertAllLinesConfirmed(order.items, order.order.number)` in
`finalizePricing`, the same test `actionsFor` uses to offer the action.

**Pin:** `orders/tests/finalize-pricing.test.ts` "finalizing an order with an
unconfirmed line is refused, and nothing is written" (asserts the action is
false, the endpoint answers 422, the spots are not pinned and the total did not
move), plus a rules unit test.

## Every pin fails before the fix

Verified by running the suite against the unfixed tree first
(`scratchpad/test1.txt`): the old assertions that pinned each defect are the
ones that broke. Specifically, before this lane's changes —
`db/checkout/items/tests/repo.test.ts` and `checkout-items-http.test.ts`
asserted `post_melt == product.content` (the fine weight in the gross column);
`transactions/credit/tests/funds.test.ts` and `db/users/tests/repo.test.ts`
asserted the balance *went negative*; `convertWeights.test.ts` pinned
`14.5833105` and asserted the SQL agreed with it; `add_funds` answered 200 for
an order with no DORADO_ACCOUNT payout and credited again on every call;
`finalize_pricing` answered 200 with unconfirmed lines; the purchase quote
answered a $0 payout for a metal with no bid; the frozen ask stayed at the
placement day; a CREDIT method waived the card surcharge; a refiner PATCH that
failed part-way left the fee on both rows; and confirming a Gold Eagle moved its
content from 1.0 to 0.916.

## Shape changes for the frontend pass

- `OrderViewFacts` gains `credited: boolean`; `OrderActions.add_funds` is false
  once a Credit ledger row exists for the order.
- `PurchaseQuote` gains `unpriceable: string[]`, and a purchase quote whose metal
  has no bid now **422s** instead of answering a $0 payout.
- `PATCH /api/checkout` with a `payment_method_id` can now answer 404 or 422.
- A scrap line (order or basket) with a weight and a purity but an unknown or
  missing unit now answers 422 instead of writing `content = 0`.
- `orders.items.post_melt` and `checkout.items.post_melt` are NULL on catalogue
  lines. `documents/pdfs/render/sections.ts` prints `post_melt ?? pre_melt`, so a
  coin now prints its gross weight rather than its fine content — no edit needed
  there, but the printed number changes.
- New contract export `WeightUnit`.

## What lane B must do

1. **`transactions/credit/service.ts removeFunds` has no floor of its own.** My
   side is correct without it: `placeSale` reads `FOR UPDATE` and refuses, and
   134's CHECK backstops the rest. If lane B wants the service to refuse rather
   than let the constraint raise, the change is: give `removeFunds` the same
   `users.balanceForUpdate` + `refuseNegativeBalance` pair `adjustDoradoCredit`
   already uses, taking the caller's `tx`. Both my tests
   (`transactions/credit/tests/funds.test.ts` "removing more than the balance is
   refused by the database, not recorded" and `db/users/tests/repo.test.ts`)
   assert *refusal*, not the error's wording beyond the constraint name — if the
   service starts refusing first, those two assertions need their matcher
   changed from `/users_dorado_funds_non_negative/` to whatever `Invalid` says.
2. **I edited two files near lane B's boundary**, both only because a change of
   mine invalidated an assertion that pinned the old defect:
   `src/domains/transactions/credit/tests/funds.test.ts` and
   `src/db/users/tests/repo.test.ts`. No non-test file under `transactions/**`,
   `accounts/**`, `shared/middleware` or `shared/cron` was touched.
3. **`auth.users` already carried `users_dorado_funds_non_negative` on dev when
   134 first ran** (as `NOT VALID`), so someone added it before me. 134 is
   guarded and idempotent, but if that constraint is also in another lane's
   migration file, the two files must be reconciled at merge — keep one.

## One gate repair that is not a money fix

`verify:backfill` began failing on `media.pdfs holds 1 rows, is not registered
in TABLES, and is not declared in NOT_REBUILT` — dev rendered its first document
at some point during these lanes, and the table had never held a row before.
Nothing in this lane touches media; the entry was simply missing.
`scripts/verify-backfill.mjs` now declares it beside `media.emails`, with the
same reason those two share: **090 created both after the pivot, and exchange
never held a generated PDF, so there is no source to rebuild one from.** If
lane C adds the same entry, keep one.

## Merge notes

- Migration **134** is `134_one_definition_of_fine_content.sql`. If another lane
  also numbered a file 134, renumber before merging.
- `api/migrations/000_genesis_schema.sql` was regenerated from dev after 134
  (`dump:schema`, baseline bumped to `002-134`). Because dev is shared, that
  regeneration also picked up two changes that are **not mine** and belong to
  other lanes: `media.email_kind` gaining `sales_order_created`, and the
  `shipments_tracking_number_unique` index. The same is true of
  `packages/contracts/src/media/enums.ts`. Whoever merges last should regenerate
  once more rather than resolving those hunks by hand.
