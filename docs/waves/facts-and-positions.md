# Facts and positions

Jacob, 2026-09-12, ruling 112: *"Statuses are great for look and feel, but
they're not driving logic. An admin should be able to do anything, even sending
a payout before the refiner has given us an assay, or sending bullion without a
payment (with an are-you-sure modal)."*

So the database stores FACTS — timestamps and rows — and every label a person
reads is derived in SQL inside the view, on the model of `refining.orders`'
`state`. The frontend never computes a state.

Two more rulings land with it. **113**: an `inventory` domain owns the lot —
position, split, combine, the lot view, the inventory summary. **114**: a change
that sets columns of one row with derived consequences and no side effect is a
PATCH on that resource's generic update, guarded in `rules.ts`.

---

## 1. The facts that were added

| migration | fact | why |
|---|---|---|
| `178_a_lot_remembers_what_was_declared.sql` | `lots.items.declared_unit / declared_quantity / declared_pre_melt / declared_post_melt / declared_purity`, a generated `declared_content`, and `assayed_at` | the Intake design draws a VARIANCE per lot, and today the in-house assay OVERWRITES the customer's declaration through `PATCH /api/orders/lots/:id`. |
| `179_a_combine_leaves_a_trail.sql` | `lots.items.combined_into_id` | a split records `split_from_id` on the child; a combine had no column at all. |
| `180_an_order_is_cancelled_by_a_fact.sql` | `orders.orders.cancelled_at` | the one value of `status` that drove anything. |
| `181_the_order_state_is_derived.sql` | drops `orders.orders.status` | see §3. |
| `182_an_override_says_why.sql` | `payments.transfers.override_reason`, and `transfers_one_live_per_order_kind` narrowed to `… AND override_reason IS NULL` | see §4. |
| `183_backfill_the_facts_the_status_stood_for.sql` | the delivery and payout facts legacy orders never recorded | see §3's matrix. |
| `184_the_arrival_is_the_handover_itself.sql` | drops the `received_at` column 177 briefly added, and backfills the ARRIVAL as the handover's own done state | see "Arrival is not a column" below. |
| `185_an_arrival_has_one_definition.sql` | the view `fulfillments.arrivals` | three reads ask "has it arrived?" and they correlate on two different owners, so the answer is a view, not a fragment. |

### The assay shape, and the alternative rejected

**What landed.** The declaration is frozen beside the measurement on
`lots.items`, and `assayed_at` records when a measured column last moved. Two
database triggers do the writing, because the database stamps facts and code
never writes them (the `audit_stamp` precedent):

- `declare_stamp` BEFORE INSERT fills `declared_*` from the values the row was
  created with, so every path that mints a lot — placement, an admin adding a
  lot, a split, a combine — freezes its declaration without one INSERT statement
  naming the columns.
- `assay_stamp` BEFORE UPDATE sets `assayed_at` when `pre_melt`, `post_melt`,
  `purity`, `unit` or `quantity` actually changes.

`declared_content` is generated exactly the way `content` already is, so the
variance in fine ounces is `content - declared_content` and no TypeScript adds
it up.

**Where it lives, and why not on `orders.lots`.** The first draft put
`declared_*` on `orders.lots` — the order-and-money join row. That is wrong: the
lot is the physical thing that was weighed, and a lot can outlive the order that
brought it in (a split child, a combine result, a pool draw). `orders.lots`
carries the money.

**The alternative rejected: append-only measurement rows by stage** — ruling
40's parked model, one row per weighing with a `stage` column. It answers more
questions (every re-weigh, in order, with its actor) and it is the right shape if
lots ever get a full measurement history. It was rejected here because it makes
`content` a read over a table instead of a generated column, and `content` is
what every price, manifest, settlement and pool credit in the build already
reads. Two snapshot columns and a stamp are the smallest honest shape for the one
question the screens ask.

**No second write path was built.** The measured columns already existed on
`lots.items` and are already settable through `PATCH /api/orders/lots/:id`; that
PATCH is the in-house assay, cascade and all (the premium retier across sibling
lots is an accepted, documented exception). Ruling 114 asked for the inbound
receipt to become a PATCH rather than an action endpoint; it became NOTHING
instead, which is better — see "Arrival is not a column" below.

### Arrival is not a column

Jacob, mid-lane: **there is no "mark received" action and no `received_at`
column.** Arrival IS the inbound fulfillment reaching its done state, and each
kind already has one:

| kind | arrived when |
|---|---|
| SHIPMENT | the inbound parcel's `shipping_status = 'Delivered'` (or `delivered_at` is set) |
| PICKUP | `fulfillments.status = 'PICKED_UP'` |
| DIRECT | `fulfillments.status = 'COMPLETED'` |
| DROPOFF | `fulfillments.status = 'DROPPED_OFF'` |

A second column saying the same thing is a second place to keep correct. So
`177` was deleted rather than left as a file creating a column nothing reads,
`184` drops it from the databases that already ran it, and the question is
decided ONCE, in the database: `185_an_arrival_has_one_definition.sql` adds the
view `fulfillments.arrivals` (the fulfillment, its two possible owners, and
whether it has reached its done state). Three reads ask it — the purchase
order's `Awaiting Receipt` rung and the lot's `on hand` position through
`api/src/db/fulfillments/sql/arrived.sql` substituted as
`/*__fulfillment_arrived__*/`, and a refiner BUY order's `Awaiting Delivery`
rung directly — so the order's label, the lot's position and the refiner order's
label cannot disagree. A view rather than one more SQL fragment because the
first two correlate on an `orders.orders` row and the third on a
`refining.orders` one, and one fragment cannot serve both correlations.

Nothing sets arrival by hand. There is no `PATCH /api/fulfillments/:id
{ received_at }`, no `rules.assertReceivable`, and "receiving before arrival" is
not a rule at all — positions and labels stay derived, never set.

`184` also backfills the arrival for legacy orders, for the same reason `183`
backfills the payout: `exchange.purchase_orders.purchase_order_status` is the
only evidence the business has that a legacy parcel arrived. For a SHIPMENT it
stamps the inbound parcel `Delivered`; for the other three kinds it moves
`fulfillments.status` to that kind's done value.

### What `set_status` kept, and what it lost

`POST /api/fulfillments/set_status` still drives the handover ladder and still
writes `fulfillments.dropoffs.departed_at` / `dropped_off_at` — a drop-off
reaching the refiner is a different fact from a customer parcel arriving, and it
stays where it is. What it lost is the pickup-complete email, which was the only
automatic send on that path. Ruling 15 says email is manual, so it became
`POST /api/emails/pickup_complete` (admin, body `{ order_id }`) beside the one
manual send that already existed. `rules.assertTransition` became
`rules.transitionConfirm`: an out-of-ladder move is a confirm, not a refusal.

---

## 2. Position, and the `inventory` domain

`#inventory/*` is declared in `api/package.json`, so `scripts/lib/layout.ts`
picks it up and every lint, `vitest.config.ts` and its coverage keys follow.

`position` is derived and never stored, from one SQL expression in one place
(`api/src/db/lots/items/sql/position.sql`), substituted into every read the way
`order_reference.sql` already is, so two reads cannot disagree. The six
positions, in the order the CASE evaluates them:

| position | derivation |
|---|---|
| `consumed` | `combined_into_id` is set, or a child names it in `split_from_id` |
| `sold` | an `orders.lots` row on a `sale`-direction order |
| `pooled` | a `refining.lots` row whose refining order has `settled_at` |
| `at refiner` | a `refining.lots` row whose refining order is sent, unsettled and uncancelled |
| `on hand` | on a purchase order whose inbound handover has arrived, or on no order at all |
| `incoming` | on a purchase order whose handover has not reached its done state |

Routes:

- `GET /api/lots` (admin) — filters `position` (repeatable), `metal_id`, `kind`
  (`scrap` \| `bullion`), `order_id`, `refiner_id`, `q`. One route is both the
  Inventory table and the lots ledger.
- `GET /api/lots/:id` (admin) — the lot screen: details, where, worth, lineage,
  timeline, every figure from SQL or a pricing read.
- `POST /api/lots/combine` (admin) — blocked unless every lot is on hand and
  they share a metal and a unit; content is conserved; SQL mints the new row.
- `POST /api/orders/lots/:id/split` — the URL stays where it is declared
  (ruling 13); the handler moved to inventory.
- `GET /api/inventory/summary` (admin) — per metal, on-hand lots, fine ounces
  and an estimated value from the pricing domain; pool ounces per refiner from
  refining's own balances read.

Assign-to-sale and batch-across-orders are NOT in this lane.

`unassigned=true` survives beside the position filter, and deliberately: a lot
on a DRAFT refiner order is not yet `at refiner` (that rung needs `sent_at`) but
is not free to batch again either, so "no `refining.lots` row" is a different
question from any position and the Adding Lot autocomplete asks it. `LotView` was deliberately
NOT widened — it is nested as `OrderLotView.lot` and inside the refining views,
both built by `to_jsonb(li)` in SQL that does not carry the new columns, so the
inventory reads parse through `InventoryLotView` (`LotView` plus `position`, the
order and refiner references and `variance`) instead. Combine conserves content
exactly: the new lot's purity is `sum(content) / fine_content(sum(weight), unit, 1)`,
so `metals.fine_content` reproduces the sum of the parents to the digit.

The lot view carries `actions` too — `split` while a lot is `incoming` or
`on hand`, `combine` while it is `on hand`. Both refusals are BLOCKED: splitting
a pooled, sold, at-refiner or consumed lot, and combining across metals, units or
positions, are data errors, not judgment calls.

---

## 3. The order's state is derived, and `status` is gone

`orders.orders.status` was free text with no enum and no CHECK, written by six
different paths and read for exactly one value — `'Cancelled'`
(`statuses.md` §Q1). `180` carried that value onto `cancelled_at`; `181` dropped
the column.

The label is `api/src/db/orders/sql/order_state.sql`, one `CASE` substituted into
`list.sql`, `view.sql` and three `places` reads through `/*__order_state__*/`.
Cancelled wins; then Completed, when every fact of that direction is done;
otherwise the label names the EARLIEST missing fact, so an admin who pays before
the refiner settles still sees what is outstanding rather than a rung the order
skipped.

| direction | ladder |
|---|---|
| purchase | `Cancelled` · `Awaiting Receipt` · `At Refiner` · `Awaiting Payout` · `Ready to Pay` · `Completed` |
| sale | `Cancelled` · `Awaiting Payment` · `Preparing` · `In Transit` · `Completed` |
| refiner sell | unchanged: `Cancelled` · `Disputed` · `Settled` · `Pending assay` |
| refiner buy | new: `Awaiting Delivery` · `Awaiting Payment` · `Settled`/`Completed` |

`Draft` is drawn in Figma and is NOT derived: no fact backs it — every row in
`orders.orders` is a placed order.

### What else read `status`, and what it reads now

| reader | now |
|---|---|
| `rules.statusesFor` and `OrderActions.statuses` | deleted — `grep` found zero consumers |
| `rules.actionsFor`'s `cancelled` flag | `cancelled_at` |
| `rules.assertReopenable` | `cancelled_at` |
| `find_sales_awaiting_settled_intent.sql` (`status = 'Pending'`) | the sale's own money facts: a succeeded intent and an unresolved `payments.ledger` `Reserve` row |
| `places/addresses/sql/is_active.sql`, `active_among.sql`, `user-addresses/sql/view.sql` (`status IS DISTINCT FROM 'Completed'`) | the derived state `<> 'Completed'` — these three were NOT in `statuses.md`'s inventory and are the address book's lock |
| `sweeps.sweepSettledIntents` (`Pending` → `Preparing`) | nothing to advance; its whole job is `credit.settleReservation`, whose single-statement `resolveReservation` is its own idempotency guard |
| `sweeps.cancelPendingSale`, `transactions/webhook.ts` | `cancelled_at` / the reservation |
| `orders.service.cancel` | now stamps `cancelled_at`. It previously wrote NO status at all, which `statuses.md` §Q1 records as a defect. |
| `rules.isSettled` (defined twice) | one definition, in `#transactions/rules.ts`, re-exported by orders |

### The chain6 matrix

Measured on the production-shaped copy before the column went. `chain6` itself
was read-only; the measurement ran on `chain6_facts`, a `CREATE DATABASE …
TEMPLATE chain6` clone brought from migration 133 up to 183. 72 legacy orders.

**Before `183`** — the derivation disagreed with `exchange` on 57 of 72:

| direction | `exchange` status | derived | n |
|---|---|---|---|
| purchase | Cancelled | Cancelled | 4 |
| purchase | Completed | **Awaiting Receipt** | 19 |
| purchase | Completed | Completed | 5 |
| purchase | Completed | **Ready to Pay** | 32 |
| purchase | In Transit | Awaiting Receipt | 2 |
| sale | Completed | Completed | 3 |
| sale | Completed | **In Transit** | 6 |
| sale | Preparing | Preparing | 1 |

Every disagreement was a MISSING FACT, not a wrong ladder, and the fix went into
the backfill rather than into a stored label:

- **19 purchase orders read `Awaiting Receipt`.** Their inbound handover never
  reached its done state in the legacy data — no carrier scan, no terminal
  status. `184` derives it from `exchange`'s own status text.
- **32 purchase orders read `Ready to Pay`.** `payments.transfers` is EMPTY on a
  production-shaped database — no migration ever backfilled it — and
  `exchange.payouts` records where to pay, never that we paid. This is the
  dangerous one: without the rows, every completed legacy order OFFERS
  `Send payment`, and an admin acting on that offer pays a customer twice.
- **6 sales orders read `In Transit`.** The outbound parcel carries no
  `delivered_at`.

`183_backfill_the_facts_the_status_stood_for.sql` derives all three from the only
evidence the business has — `exchange.purchase_orders.purchase_order_status` and
`exchange.sales_orders.sales_order_status`, READ and never written — minting the
legacy payouts as `provider = 'legacy'`, `state = 'Sent'`, with no
`provider_ref` so nothing reconciles them against a rail. An order paid into a
Dorado balance is a `payments.ledger` Credit, not a transfer, and is skipped.
Every statement is guarded on the fact being absent; re-running the file writes
0 rows.

**After `183`** — 70 of 72 derive exactly what `exchange` holds:

| direction | `exchange` status | derived | n |
|---|---|---|---|
| purchase | Cancelled | Cancelled | 4 |
| purchase | Completed | Completed | 56 |
| purchase | In Transit | Awaiting Receipt | 2 |
| sale | Completed | Completed | 9 |
| sale | Preparing | Preparing | 1 |

The remaining 2 are a RENAME, not a disagreement: `In Transit` on a purchase
order and `Awaiting Receipt` are the same fact — the parcel has not arrived.

`030_correct_stale_order_status.sql` and `031_backfill_orders.sql` were edited to
write `cancelled_at` instead of `status`, for the reason 031's own offers block
already records: these files are part of the build-from-nothing path and a
migration naming a dropped column breaks it. `scripts/lib/feature-map.ts` now
maps `purchase_order_status` / `sales_order_status` to `cancelled_at` so
`audit:coverage` stays honest.

---

## 4. Blocked, override, confirm

Ruling 112 as amended by Jacob the same day: three classes, not two.

- **blocked** — a DATA ERROR. Stays a throw in `rules.ts`.
- **override** — serious money, *"made as hard as possible"* but possible. A
  fresh step-up on the session (`POST /api/account/step_up`;
  `auth.sessions.stepped_up_at`, a 300-second window) AND an `override_reason`
  of at least 10 characters in the body, stored on the row. Refused without both,
  by a domain error naming both requirements.
- **confirm** — business judgment. Allowed; the reason comes back beside the
  action and the UI asks.

The views' `actions` are now `Action[]`, each `{ name, confirm, override }`, so
the UI knows which modal to show. An action absent from the array is not
offered. `OrderActions.statuses` and `finalize_blocked_by` are gone.

### Every rule that gates an ACTION on state

| rules file | rule | class | converted? |
|---|---|---|---|
| orders | `assertSaleQuote` — a purchase basket placed as a sale | blocked | — |
| orders | `assertDirection` — an action on the wrong direction | blocked | — |
| orders | `assertReturnable` — cancel with no address snapshot | blocked | — |
| orders | `assertReturnService` — no carrier service supports returns | blocked | — |
| orders | `assertCreditable` — no total to credit | blocked | — |
| orders | `assertPayableToAccount` — the payout method is not a Dorado balance | blocked | — |
| orders | `assertReopenable` — the order is not cancelled | blocked | — |
| orders | `assertCreditCovers` — the balance moved mid-placement | blocked | — |
| orders | `assertPlaceable` / `requireAddress` / `requireFreeFulfillmentDraft` | blocked | — |
| orders | `assertEveryMetalQuoted` — no live quote | blocked | — |
| orders | `assertAboveStripeMinimum`, `assertOpenIntent`, `assertIntentLive`, `assertAttachable`, `assertRepairable` | blocked | — |
| orders | `assertRepriced`, `assertRemoved`, `assertEveryLineCopied`, `assertTotalsWritten`, `assertPlacedOrder` | blocked (write integrity) | — |
| orders | `finalizeBlockedBy` — not a purchase order; the order holds no lots | blocked | kept |
| orders | finalize with lots that are not confirmed | **confirm** | yes — `finalizeConfirm` |
| orders | finalize with lots that have no fine weight | **confirm** | yes — `finalizeConfirm` |
| orders | `send_payment` before the refiner settles | **confirm** | yes — `payoutConfirm`, `Refiner has not settled N of M lots` |
| orders | ship a sale before the charge settles | **confirm** | yes — `shipConfirm` |
| orders | `assertNotAlreadyCredited` — add funds twice | **override** | yes — `assertCreditOverride` + step-up |
| refining | `assertUnassigned` — the lot is on another refiner order | blocked | — |
| refining | `assertSaleOrder` / `assertPurchaseOrder` | blocked | — |
| refining | `assertCancellable` — cancel a settled or already-cancelled refiner order | blocked | — |
| refining | `assertSuppliable` — the order holds no lots | blocked | — |
| refining | `assertNoOpenSellOrder` — one open sell order per refiner | blocked | — |
| refining | `assertSendable` — already sent; no lots to send | blocked | — |
| refining | `assertSettleable` — settle an order never sent; settle twice | blocked | — |
| refining | `assertSettling` — a settlement line naming a lot not on the order | blocked | — |
| refining | `assertLotsExist`, `assertEveryLotSettled`, `assertLotRemoved` | blocked | — |
| refining | `assertFinalizedOrder` — sell lots off an unfinalized order | **confirm** | yes — split into `assertOrderExists` plus a `refining_sale` action on the ORDER carrying the reason |
| refining | `assertOpen` — add or remove lots on a sent order | **confirm** | yes — `sentConfirm`, on the refiner order's `edit_lots` action |
| refining | `assertSettling` — held lots carrying no assay | **confirm** | not yet, see §6 |
| refining | `assertSettlementPremiums` — lots with no premium | **confirm** | not yet, see §6 |
| refining | `assertLockable` — the pool balance is at or below zero | **confirm** | not yet, see §6 |
| transactions | `assertOneOrder`, `assertKind`, `assertRail` | blocked | — |
| transactions | `assertOpenable` — the order owes nothing | blocked | — |
| transactions | `assertPayable` — no bank link, unverified link, no rail method | blocked | — |
| transactions | `assertUnmatched` / `assertMatched` | blocked | — |
| transactions | `assertWalletMethod`, `assertMoovAccount`, `assertFeedToken` | blocked (configuration) | — |
| transactions | send a payout that is not in its opening state | **override** | yes — `overrideFor` + step-up |
| transactions | open a payout above what the order owes | **override** | yes — `payoutOverrideFor` + step-up |
| transactions | open a second payout while one stands | **override** | yes, and the partial unique index enforces it in the database |
| logistics | `assertMovable` — move off SHIPMENT with a label bought | blocked | — |
| logistics | `assertDraft`, `assertFulfillable`, `assertIsCategory`, `assertChoicesMatchCategory` | blocked | — |
| logistics | `assertTransition` — a handover move outside the LADDER | **confirm** | yes — `transitionConfirm`, and `FulfillmentActions.moves` now offers every step the kind can reach with the reason attached |
| logistics | `assertCategoryStatus` — a step that is not one of that KIND's at all (IN_PROGRESS on a pickup) | blocked | new in this lane |
| logistics | `assertOffered` — a method not offered for that direction | **confirm** | not yet, see §6 |
| inventory | split a lot that is pooled, sold, at a refiner or consumed | blocked | new in this lane |
| inventory | combine lots that are not all on hand, or span metals or units | blocked | new in this lane |

**No payout-timing setting exists.** `inventory-model.md` §3 and
`orders-lots-proposal.md` §5.3 proposed `after_settlement` \| `on_assay` in
Settings. Ruling 112 removes it: the gate it would have switched is now the
confirm reason on `send_payment`, and there is nothing left to switch.

---

## 5. Response-shape changes, for the frontend pass

The gate runs no frontend member (ruling 55) and the frontend informs no API
decision (ruling 44). These are the wire changes a frontend pass has to absorb.

| shape | change |
|---|---|
| `Order` | `status` is GONE; `cancelled_at` is new |
| `OrderPatch` | `{ notes, assigned_to_id }` — `status` no longer accepted, so `PATCH /api/orders/:id { status }` is now a 400 |
| `OrderListItem` | gains `state` |
| `OrderViewFacts` / `OrderView` | gains `state` |
| `OrderActions` | was an object of booleans plus `statuses` and `finalize_blocked_by`; is now `Action[]`, `{ name, confirm, override }` |
| `Action` (new, `computed/orders.ts`) | `{ name: string, confirm: string \| null, override: string \| null }` |
| `OrderState` (new) | the nine labels |
| `OverrideBody` (new) | `{ override_reason? }` — the body `add_funds` takes |
| `Lot` | gains `declared_unit`, `declared_quantity`, `declared_pre_melt`, `declared_post_melt`, `declared_purity`, `declared_content`, `assayed_at`, `combined_into_id` |
| `LotView` | gains `position` and the order / refiner references the Lot Row draws |
| `FulfillmentParcel` | gains `delivered_at` — the arrival signal for a SHIPMENT |
| `Transfer` | gains `override_reason` |
| `OpenPayoutBody` | gains optional `amount` and `override_reason` |
| `SendPayoutBody` (new) | `{ override_reason? }` |
| `RefiningOrderRead` (new) | the refiner order view plus `actions` |
| refiner order `state` | gains `Awaiting Delivery` and `Awaiting Payment` for `direction = 'buy'` |
| `POST /api/emails/pickup_complete` (new) | admin, `{ order_id }` — the send `set_status` used to fire |
| `InventoryLotView` (new) | `LotView` plus `position`, `variance` and the order / refiner references |
| `LotDetail` (new, `computed/inventory.ts`) | `{ lot, where, worth, lineage, timeline, actions }` |
| `InventorySummary` (new) | `{ metals: InventoryMetal[], pool: PoolBalance[] }` |
| `GET /api/lots` | same URL, new filters (`position` repeatable, `metal_id`, `kind`, `order_id`, `refiner_id`); `q` and `unassigned` unchanged |
| `FulfillmentActions` | gains `moves: Action[]` beside `transitions` — every step the kind can reach, with a confirm on the ones the ladder does not open |
| `OrderActions` entries | `cancel`, `reopen`, `finalize`, `add_funds`, `send_payment`, `supply`, `refining_sale`, `buy_label`, `ship`, `update_tracking`, `edit_lots`, `assign_lots`, `lock_spots`, `unlock_spots` |
| `RefiningOrderRead.actions` | `edit_lots`, `send`, `settle`, `dispute`, `cancel`, `lock_ounces` |
| `LotDetail.actions` | `split`, `combine` |

---

## 6. What this lane did not do

- Three confirm-class rules are CLASSIFIED but not converted, because converting
  them changes what a settlement writes rather than what a screen shows:
  `assertSettling`'s missing-assay half, `assertSettlementPremiums`, and
  `assertLockable`'s balance check. `assertOffered` is the fourth.
- Assign-to-sale (`POST /api/orders/lots/:id/assign`), batch-across-orders
  (`POST /api/refining/orders/batch`) and pool draws are out of scope, as the
  brief says.
- `Draft` is drawn in Figma and has no fact behind it.
- The frontend is untouched.
