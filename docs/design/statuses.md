# Statuses: a full inventory, and a proposal to centralize

Written 2026-09-11, for Jacob's question: *"We need to centralize all the
statuses we're going to have as well... I guess we need like, completed? Or
maybe that's derived from payment/fulfillment status."* This document lists
every status, state, stage, kind-that-acts-as-a-state, and lot position the
system has today, answers his questions with evidence, and proposes one
centralized set. No code is written here. No database was queried; every fact
below comes from `api/migrations/*.sql` and `api/src`.

Counts: 26 Postgres enum types (not 28 - see the note under Section 1). 46
status-like rows inventoried in Section 1, across 13 entity groupings.

## Section 1: the inventory, grouped by entity

A note on the enum count: `grep -c "CREATE TYPE .* AS ENUM"` over
`api/migrations/*.sql` finds 26 distinct type names, not 28. Two migrations
(`090_paper_trail_for_documents_and_mail.sql:26` and `:33`) define earlier,
narrower versions of `media.pdf_kind` and `media.email_kind` that genesis's
baseline (`002-134`, `api/migrations/000_genesis_schema.sql:1`) already
superseded and folded into the wider lists shown below; they are the same
type, not a second one. `061b_remaining_residue_062_does_not_reach.sql:8` is a
false match (the word "enumerated", not `AS ENUM`). 26 is the count of enum
types that exist in the schema today.

### Orders (customer purchase, customer sale, refiner purchase, refiner sale)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `orders.orders.status` (`api/migrations/000_genesis_schema.sql:1072`, `text`, no enum, no CHECK) | Purchase: `In Transit`, `Received`, `Payment Processing`, `Cancelled`, `Completed`. Sale: `Pending`, `Preparing`, `In Transit`, `Completed`, `Cancelled`. Ladders in `api/src/domains/orders/rules.ts:155-168` | stored (free text - `packages/contracts/src/orders/orders.ts:13` is `z.string().nullable()`, not an enum) | `rules.statusesFor` (`orders/rules.ts:194`, offers next legal values); `rules.actionsFor` (`orders/rules.ts:219`, only reads `=== 'Cancelled'`); `rules.assertReopenable` (`orders/rules.ts:420`, only reads `!== 'Cancelled'`); `db/orders/sql/find_sales_awaiting_settled_intent.sql:6` (`WHERE o.status = 'Pending'`) | Header shows a "Cancelled" badge only (`frontend/app/admin/_src_/orders/OrderHeaderCard.tsx:47-50`, comment: *"the Cancelled badge earns its place here because it stops every other card; no other order-level status does, so none is drawn"*) | see Q1/Q2 - mostly `derive`, `Cancelled` is `keep` |
| `orders.orders.spots_locked` (`000_genesis_schema.sql:1068`, boolean) | `false` / `true`, refined to a third UI state by `isFinalized` (`orders/rules.ts:212`, locked AND a total exists) | stored | `actionsFor.lock_spots`/`unlock_spots` (`orders/rules.ts:237-238`); `assertFinalizable` | Spots card: Unlocked / Locked / Finalized (orders-notes-2026-09-05.md section 3) | `keep` |
| `OrderActions.statuses` (`packages/contracts/src/computed/orders.ts:17`) | the ladder's offered next values | derived (advisory only - **the PATCH endpoint does not enforce it**, see Q1) | nothing - `grep -rn ".statuses\b" frontend/ packages/client/src` finds zero consumers | none drawn | `drop` |
| `orders.direction` (enum, `000_genesis_schema.sql:204`) | `purchase`, `sale` | stored | `rules.chargesSalesTax`, `assertDirection`, most of `orders/rules.ts` | eyebrow text: PURCHASE ORDER / SALES ORDER | `keep` |
| `refining.direction` (enum, `000_genesis_schema.sql:276`) | `sell`, `buy` | stored | `refining/rules.ts` `assertSaleOrder`/`assertPurchaseOrder` | screen title (Sale/Purchase Order (Refiner)) | `keep` - see Q5 for the `purchase/sale` vs `buy/sell` collision |
| refiner order `state` (`api/src/db/refining/orders/sql/view_one.sql:14-17`) | `Pending assay`, `Disputed`, `Settled`, `Cancelled`, from `cancelled_at`/`disputed_at`/`settled_at` on `refining.orders` (`000_genesis_schema.sql:1932-1950`) | **derived in SQL**, one `CASE`, comment says *"a label and drives nothing"* | `SettlementCard.tsx:14-18` (`BADGE_INTENT` lookup) | Settlement badge: Pending assay -> Settled / Disputed, Cancelled | `keep` - this is the model to copy for orders |

### Lots

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| lot `position` | `incoming`, `on hand`, `at refiner`, `pooled`, `sold`, `consumed` | **fully derived, no column anywhere** (`docs/design/inventory-model.md:11-22`) - proposed, not yet built (`docs/design/orders-lots-proposal.md:170-188`) | proposed: `LotView.position`, the Inventory table filter | Lot Row / Lot Tile position badge | `keep as derive` (build it) |
| `lots.items.split_from_id` (`000_genesis_schema.sql:874-892`) | uuid or null | stored (a fact: this lot came from a split) | position derivation reads it to mark a parent `consumed` | none directly; Lot Tile shows "at refiner · RO-118" etc. once left | `keep` |
| combine lineage | none | **gap** - a combine has no column at all (see Q3 and `orders-lots-proposal.md:243-247`) | n/a | n/a | open, see Section 4 |

### Refining orders and settlement

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `refining.orders.sent_at` / `.settled_at` / `.disputed_at` / `.cancelled_at` (`000_genesis_schema.sql:1932-1950`) | timestamp or null, each an independent fact | stored | `assertOpen`, `assertSendable`, `assertSettleable`, `assertCancellable` (`refining/rules.ts:86-135`) - four gates, one per timestamp | derived into the `state` label above | `keep` (the four timestamps), the `state` label is `derive` |
| `refining.lots.settled_at` (`000_genesis_schema.sql:1901-1917`) | timestamp or null | stored, per-lot | position derivation (`pooled` once its order is settled) | none directly | `keep` |

### Pool

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `refining.pool.entry` (enum `refining.pool_entry`, `000_genesis_schema.sql:285`) | `credit`, `lock` | stored, append-only ledger | `refining/rules.ts:207` `assertLockable`; pool balance = sum of entries | Inventory card: pool ounces per metal | `keep` |

### Payments (payout transfers, charges/intents, attempts, inbound matches, bank links)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `payments.transfers.state` (enum `payments.transfer_state`, `000_genesis_schema.sql:1571-1591`, added by ruling 97 in `150_the_payment_rails_are_rows.sql`) | `Not sent`, `Due`, `Processing`, `Sent`, `Received`, `Failed` | stored, one state machine for both payout and charge (`kind` picks the ladder) | `transactions/rails/rules.ts:16-33` (`RANK`, `SETTLED`, `OPENING`); `movesForward` (monotonic-only) | Payment card badge, `INTENT` map (`frontend/.../PaymentCard.tsx:35-41`) exactly matches | `keep` |
| `payments.transfer_events.reported_state` (`000_genesis_schema.sql:1546-1568`) | a `transfer_state` value, nullable - what a webhook reported, before the forward-only check is applied | stored (audit log; the applied value may differ from this) | nothing reads it for logic today (audit trail only) | none | `keep` (it is the replay-safety record) |
| `payments.attempts.status` (`000_genesis_schema.sql:1218-1236`, `text DEFAULT 'CREATED'`) | Stripe's own PaymentIntent vocabulary at time of attempt | stored | `service.ts:153` writes it; nothing decides on the historical value | none | `keep` (it's a log row) |
| `payments.intents.status` (`000_genesis_schema.sql:1381-1403`, `text DEFAULT 'CREATED'`) | Stripe: `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `succeeded`, `canceled` | stored | `transactions/rules.ts:17-31` `isOpen`/`isResolved`/`isSettled`; `orders/rules.ts:107` has its **own** copy of `isSettled` | none directly (feeds order placement) | `keep`, but see Q5 (duplicated `isSettled`) |
| `payments.stripe_charges.status` (`000_genesis_schema.sql:1515-1539`, `text NOT NULL`) | Stripe Charge status | stored | reconciliation only | none | `keep` |
| `payments.bank_links.status` (enum `payments.link_status`, `000_genesis_schema.sql:1241-1252`) | `pending`, `verified`, `errored` | stored | `transactions/rails/rules.ts:144` `assertPayable` (only `verified` may be paid) | Payment · Adding Account state (open item, orders-notes section 7) | `keep` |
| `payments.inbound_transactions.state` (enum `payments.match_state`, `000_genesis_schema.sql:1342-1352`) | `Unmatched`, `Matched`, `Ignored` | stored | `assertUnmatched`/`assertMatched` (`transactions/rails/rules.ts:171-183`) | Matching picker candidate list | `keep` |
| `MatchRung` (`packages/contracts/src/payments/inbound_transactions.ts:54`) | `account`, `reference`, `heuristic`, `manual` | computed (which reconciliation rule found the candidate) | Matching picker ranking | pre-select vs. manual pick | `keep` (it is a UI hint, not a state) |
| "Matching" (`frontend/.../PaymentCard.tsx:27` `matching: boolean`) | true/false | **UI-local only, not derived from any column** | shows/hides the Autocomplete + Confirm match UI | Payment card's "Matching" mode | not a status at all - `drop` from the inventory of real states |

### Fulfillments (shipment, return shipment, pickup, appointment, drop-off, linked/drop ship)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `fulfillments.fulfillments.status` (enum `fulfillments.fulfillment_status`, `000_genesis_schema.sql:747-762`; was free text until `168_the_screens_ask_for_columns.sql:94-107` converted it - GAP 19, dev held only `PENDING`/`SCHEDULED`/`COMPLETED` and the migration added the four the design notes name) | `PENDING`, `SCHEDULED`, `IN_TRANSIT`, `PICKED_UP`, `IN_PROGRESS`, `COMPLETED`, `DROPPED_OFF` - **one column for pickup, appointment (DIRECT) and drop-off alike** | stored | `isCollected` (`logistics/fulfillments/rules.ts:16-20`); `transitionsFor` (`:25-42`, branches per `category`); `assertTransition` (`:210-220`) | `ScheduleCards.tsx:24-38` `STATUS_LABEL`/`STATUS_INTENT` - re-spells `PICKED_UP` -> "Picked Up" | `keep`, but see Q5 (mixes vocabularies per kind) |
| `fulfillments.category` (enum `fulfillments.category`, `000_genesis_schema.sql:159-166`) | `SHIPMENT`, `PICKUP`, `DIRECT`, `DROPOFF` | stored | `categoriesFor`, `documentsFor`, `requiresSchedule` | Create Fulfillment tab / card title | `keep` |
| checkout/fulfillment readiness (`CheckoutMissing`, `FulfillmentStep`, `packages/contracts/src/fulfillments/fulfillments.ts:116-125`, `checkout/checkouts.ts:58-66`) | field names, e.g. `carrier_service_id`, `pickup_date` | derived (`missingFor`, `logistics/fulfillments/rules.ts:91-131`; `checkoutState`, `checkout/rules.ts:97-114`) | placement gate | none (gates "Place order") | `keep` - already the derived pattern to copy |

### Shipping (tracking events)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `shipping.shipments.shipping_status` (`000_genesis_schema.sql:2156`, `text`) | `Label Created`, `Picked Up`, `In Transit`, `Out for Delivery`, `Delivered`, `Cancelled` - FedEx codes mapped in `api/src/providers/fedex/constants.ts:37-78` | stored, external fact (carrier webhook / label purchase) | `shipmentActions` (`logistics/shipping/rules.ts:307-317`, `settled` = Cancelled or Delivered); `awaitingHandoff` (`:303-305`) | `ShipmentCard.tsx:21-27` `BADGE` map (its own `Phase` type, computed from shipment facts, not from `shipping_status` directly) | `keep` |
| `shipping.tracking.status` (`000_genesis_schema.sql:2193`, `text`) | one carrier scan's status, same FedEx vocabulary | stored, one row per scan | `trackingTimeline` (`logistics/shipping/rules.ts:262-292`) | Tracker component rows | `keep` |
| `shipping.pickups.status` (`000_genesis_schema.sql:2065`, `text`, CHECK at `000_genesis_schema.sql:3397`) | `pending`, `scheduled`, `completed`, `canceled` (**lower-case**) - the carrier's own pickup-request scheduling, not the operator-facing Pickup card | stored | carrier pickup cancel/reschedule flow | none (backend-only, no card shown for this table) | `keep` - see Q5 (name collision with `fulfillments.pickups`) |
| `TRACKING_STAGES` (`logistics/shipping/rules.ts:260`) | `Picked Up`, `In Transit`, `Out for Delivery`, `Delivered` | derived (the ladder used to fill in "ahead" stages not yet reached) | `trackingTimeline` | Tracker's un-reached rows read "Pending" | `keep` |

### Documents (pdf, email)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `media.pdfs.kind` (enum `media.pdf_kind`, `000_genesis_schema.sql:195-202`, 11 values) | `packing_list`, `return_packing_list`, `invoice`, `sales_order_invoice`, `shipping_instructions`, `pickup_manifest`, `pickup_instructions`, `intake_receipt`, `appointment_instructions`, `settlement`, `lot_manifest` | stored (immutable rows - no `updated_at`, regeneration inserts a new row) | `orders/rules.ts:248-292` `documentsFor` (per fulfillment category); `refining/rules.ts:218-234` | Documents card, Available/Unavailable rows | `keep` |
| document `available` (`orders/rules.ts:285-289`) | true/false | derived (rendered kinds gate on `finalized`; imported kinds gate on a stored row existing) | Documents card row | Send vs. Import | `keep` - already the derived pattern |
| `media.emails.status` (enum `media.email_status`, `000_genesis_schema.sql:186-193`) | `sent`, `failed` | stored | `outcomeOf` (`documents/emails/rules.ts:17-20`) | none surfaced yet (Media file, mailer log) | `keep` |
| `media.emails.kind` (enum `media.email_kind`, `000_genesis_schema.sql:177-184`, 18 values) | e.g. `purchase_order_created`, `payout_sent`, `pickup_booked` ... | stored | mailer content selection | Mailer · Document sent card | `keep` |

### CRM (sms, calls, timeline)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `crm.sms_messages.status` (enum `crm.sms_status`, `000_genesis_schema.sql:141-149`) | `received`, `queued`, `sent`, `delivered`, `failed`, `undelivered` | stored, forward-ranked (`crm/sms/rules.ts:23-34`) | `statusShouldApply` (monotonic guard); `ChatCard.tsx:34-36` (`delivered` / `failed`+`undelivered`) | Message bubble delivery tick | `keep` |
| `crm.calls.status` (enum `crm.call_status`, `000_genesis_schema.sql:123-131`) | `queued`, `ringing`, `in-progress`, `completed`, `busy`, `no-answer`, `failed`, `canceled`, `voicemail` (`voicemail` is Dorado's own terminal label, never sent by Twilio - `crm/calls/rules.ts:16-17`) | stored, forward-ranked (`crm/calls/rules.ts:18-28`) | `statusShouldApply` | Call Event row (Outgoing / No answer / Incoming / Missed) | `keep` |
| `CallKind` (`packages/contracts/src/computed/crm.ts:52`) | `Outgoing`, `No answer`, `Incoming`, `Missed` | derived (from `direction` + `status`, display-only) | Call Event row label | matches directly | `keep` |
| `TimelineKind` (`packages/contracts/src/computed/crm.ts:47`) | `sms`, `call`, `email` | derived (which table a timeline row came from) | Chat/timeline merge | icon per row | `keep` |
| `crm.sms_messages.direction` / `crm.calls.direction` (two separate enums, `000_genesis_schema.sql:141`, `:123`) | both `inbound`, `outbound` | stored | direction of the bubble/row | left/right alignment | `keep` - see Q5 (two enums, one vocabulary) |
| `leads.leads.converted` / `.contacted` / `.responded` (`000_genesis_schema.sql:837-855`, three independent booleans) | true/false each | stored | none found in `rules.ts` for leads/reviews (`grep` finds nothing) | not yet surfaced | `merge` into one derived lead stage (New -> Contacted -> Responded -> Converted) |
| `leads.leads.priority` (`000_genesis_schema.sql:837-855`, `text DEFAULT 'Medium'`) | free text, conventionally Low/Medium/High | stored, unconstrained | none | not surfaced | `rename` to an enum if it stays free-standing |
| `reviews.reviews.hidden` (`000_genesis_schema.sql:1994-2007`, boolean) | true/false | stored | moderation only | not surfaced | `keep` |

### Auth

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `VerificationStatus` (`packages/contracts/src/computed/auth.ts:14`) | `sent`, `invalid`, `verified`, `locked` | **fully computed**, no column (`accounts/auth/rules.ts:335-342` `statusAfterCheck`) | `assertCodeAccepted` (`:208-213`) | OTP screen | `keep` (a good derive example) |
| session `sessionVerdict` (`accounts/auth/rules.ts:377-385`) | `revoked`, `banned`, `live` | derived from `banned` + `ban_expires` on the user row | session middleware | none (backend gate) | `keep` |
| `auth.factor` / `auth.otp_channel` / `auth.otp_purpose` / `auth.throttle_kind` (four enums, `000_genesis_schema.sql:87-122`) | selectors, not states (which channel/purpose/kind) | stored | OTP flow routing | none | `keep` (not states - kinds) |

### Spots (lock)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| `orders.orders.spots_locked` | see Orders table above | stored | see above | Order Spots card: Unlocked / Locked / Finalized | `keep` |
| `SpotTrend` (`packages/contracts/src/spots/spots.ts:40`) | `up`, `down`, `flat` | derived (`pricing/spots/rules.ts:3-4` `trendOf`) | Spots ticker arrow | market indicator, not an order/lot state | `keep` (out of scope for centralizing - it is market data, not workflow state) |

### Catalog (found in passing)

| where | values | stored or derived | what reads it | UI label | verdict |
|---|---|---|---|---|---|
| product `display` (ruling 49, sell side has no gate) | boolean | stored | buy-side listing gate only | product visibility | `keep` (not a workflow state; noted for completeness only) |

## Section 2: Jacob's questions, with evidence

### Q1: `orders.orders.status` - what holds it, what writes it, what reads it, what could be derived

**What writes it**, exhaustively (`grep -rn "status" api/src/domains/orders/*.ts api/src/domains/transactions/sweeps.ts`):

| writer | sets it to | file:line |
|---|---|---|
| purchase placement | `'In Transit'` (hard-coded) | `orders/place.ts:166` |
| sale placement | `'Preparing'` or `'Pending'`, from `rules.statusAtPlacement(cents, settled)` | `orders/place.ts:206`, `orders/rules.ts:128-130` |
| admin PATCH `/api/orders/:id` | **any string** - `OrderPatch` is `z.string().nullable()`, not validated against the ladder or against `OrderActions.statuses` | `packages/contracts/src/orders/orders.ts:13,92`; `orders/service.ts:36-41` |
| `reopen()` | hard-coded `'Received'`, regardless of direction (a reopened **sale** order would leave the SALE_LADDER entirely - it has no `Received` value) | `orders/service.ts:178` |
| `sweeps.sweepSettledIntents` | `'Preparing'` (from `'Pending'`, sale only, when a webhook settlement covers the total) | `transactions/sweeps.ts:27-32` |
| `sweeps.cancelPendingSale` | `'Cancelled'` (sale only - abandoned-checkout sweep and superseded-intent path) | `transactions/sweeps.ts:50-55` |
| the purchase `cancel()` action | **nothing** - it creates a return shipment and unlocks spots; it never writes `status` at all | `orders/service.ts:221-268`; confirmed no `status` write and no test asserts one |

**What reads it**: `rules.statusesFor` (advisory ladder, no consumer - see Section 1), `rules.actionsFor`'s `cancelled` flag, `rules.assertReopenable`, and one sweep query (`find_sales_awaiting_settled_intent.sql:6`).

**Derivable vs. not**, by value:

| order state | derivable from parts? | condition |
|---|---|---|
| `In Transit` (purchase, initial) | derive | inbound shipment exists, not yet delivered |
| `Received` (purchase) | derive, once a signal exists (see Q3 gap) | inbound shipment delivered / lots received - **no column marks this today** |
| `Payment Processing` (purchase) | derive | all lots confirmed AND payout `state` in `Not sent`/`Due`/`Processing` |
| `Completed` (purchase) | derive | payout `state = Sent` (or `Received` for the credit case) |
| `Pending` (sale) | derive | charge `state = Due` and no settled intent |
| `Preparing` (sale) | derive | charge settled (`state` moved past `Due`) |
| `In Transit` (sale) | derive | outbound shipment sent and tracked |
| `Completed` (sale) | derive | outbound shipment delivered (or fulfillment `COMPLETED`/`DROPPED_OFF` for non-shipment kinds) |
| `Cancelled` (either) | **cannot derive - a DECISION** | an admin action or the abandoned-sale sweep; keep as a stored fact |

Every non-`Cancelled` value is a projection of payment state + fulfillment/lot state that already exists elsewhere. Only `Cancelled` is a genuine decision with no other row to read it from.

### Q2: is "Completed" derivable? The four order kinds

| order kind | "Completed" condition |
|---|---|
| customer purchase | payout `payments.transfers.state = 'Sent'` (or credited to a Dorado balance, `add_funds` already ran) AND every lot on the order is `pooled` or `sold` (none `incoming`/`at refiner`) |
| customer sale | charge `payments.transfers.state = 'Received'` (or settled via credit) AND the outbound fulfillment is delivered (`shipping_status = 'Delivered'`) or, for a non-shipment fulfillment, `fulfillments.status IN ('COMPLETED','DROPPED_OFF')` |
| refiner sale (we send scrap out) | `refining.orders.settled_at IS NOT NULL` (this already collapses to the existing `state = 'Settled'`) |
| refiner purchase (we buy bullion in) | inbound fulfillment complete AND our payment to the refiner `state = 'Sent'` |

**Where the parts disagree** - the four cases worth naming explicitly, and what should show:

1. Paid but a lot is still `at refiner` (purchase): show "awaiting refiner settlement", not "Completed" - this is exactly `docs/design/inventory-model.md`'s payout-gate reason line.
2. Fulfillment delivered but the charge is unmatched (sale): show "awaiting payment" - money, not metal, is the blocker.
3. Refiner order settled but the linked customer purchase order's payout has not been sent (today's default `after_settlement` policy is mid-transition): show "ready to pay" as a distinct state from "Completed" - it is a real, valid state that a two-value derivation would erase.
4. Order cancelled after partial fulfillment (e.g., a return in transit): `Cancelled` always wins and suppresses the derived ladder entirely - this is why it must stay a stored fact rather than a fourth condition to check.

### Q3: is lot position derivable from tables as they exist?

| position | derivable? | exact tables/columns |
|---|---|---|
| `incoming` | yes | `orders.lots` row exists for a lot on a `purchase`-direction order, and that order's fulfillment is not yet delivered/completed |
| `on hand` | **gap** | needs "received," and nothing marks it (see below) |
| `at refiner` | yes | `refining.lots` row exists, joined `refining.orders.sent_at IS NOT NULL AND cancelled_at IS NULL` |
| `pooled` | yes | `refining.lots` row's order has `settled_at IS NOT NULL` |
| `sold` | yes | `orders.lots` row exists for a lot on a `sale`-direction order |
| `consumed` | yes | the lot is a parent of another lot's `split_from_id` |

**The gap named precisely**: "received" has no signal anywhere. A purchase order's inbound fulfillment reaching `fulfillments.status IN ('PICKED_UP','COMPLETED')` (its `DONE` set, `logistics/fulfillments/rules.ts:16`) is the closest existing fact, but nothing today connects a fulfillment's completion to a lot or to the order's `status`. "Assayed" is a second, separate question the design notes raise (`orders-lots-proposal.md:41-44`, the `on_assay` payout policy) and it *also* has no column - only `refining.lots` (a refiner's own assay, post-shipment) carries `pre_melt`/`post_melt`/`purity`, and that is for lots already `at refiner`, not for the inbound assay that would promote `incoming` -> `on hand`.

Combine has no lineage column at all (`orders-lots-proposal.md:243-247`) - a second, distinct gap from position derivation itself.

### Q4: pure labels vs. logic-driving statuses

**Drive logic** (with the function that reads them):

- `orders.orders.status`, but only its `'Cancelled'` value - `rules.actionsFor` (`orders/rules.ts:219`), `rules.assertReopenable` (`:420`)
- `payments.transfers.state` - `movesForward`, `assertSendable`, `assertPayable` (`transactions/rails/rules.ts`)
- `payments.bank_links.status` - `assertPayable` only pays a `verified` link (`transactions/rails/rules.ts:144`)
- `payments.inbound_transactions.state` - `assertUnmatched`/`assertMatched` (`transactions/rails/rules.ts:171-183`)
- `payments.intents.status` - `isOpen`/`isResolved`/`isSettled` gate placement and webhook handling (`transactions/rules.ts:17-31`, duplicated in `orders/rules.ts:107-109`)
- `fulfillments.fulfillments.status` - `isCollected`, `transitionsFor`, `assertTransition` (`logistics/fulfillments/rules.ts`)
- `shipping.shipments.shipping_status` - `shipmentActions` (`settled`, `awaitingHandoff`) (`logistics/shipping/rules.ts:303-317`)
- `crm.sms_messages.status` / `crm.calls.status` - `statusShouldApply` (forward-only ranking)
- `orders.orders.spots_locked` - `isFinalized`, `actionsFor.lock_spots`/`unlock_spots`
- `refining.orders.sent_at`/`settled_at`/`cancelled_at` - every `assert*` gate in `refining/rules.ts`

**Pure labels** (ruling 2's promise actually kept):

- `orders.orders.status`'s non-`Cancelled` values (`In Transit`, `Received`, `Payment Processing`, `Completed`, `Pending`, `Preparing`) - offered by `statusesFor` but never checked by any gate, and not enforced at write time
- refiner order `state` (`Pending assay`/`Settled`/`Disputed`/`Cancelled`) - the view comment says so directly, and it is true: every refiner gate reads the raw timestamps, not `state`
- `media.pdfs.kind`, `media.emails.kind` - selectors, not gates
- `CallKind`, `TimelineKind`, `SpotTrend`, `VerificationStatus` - all display-only

### Q5: vocabulary collisions

| collision | example |
|---|---|
| status / state / stage, used interchangeably for the same idea | `payments.transfers.state` vs. `orders.orders.status` vs. `refining.orders`' derived `state` vs. the design notes' "Tracker rebuilt as a generic carrier log ... unscanned stages read 'Pending'" |
| SCREAMING_SNAKE vs. Title Case for the same concept, "collected" | `fulfillments.fulfillment_status.PICKED_UP` (`000_genesis_schema.sql:751`) vs. `shipping.shipments.shipping_status = 'Picked Up'` (`providers/fedex/constants.ts:43`) - the frontend independently re-spells the first into the second's words (`ScheduleCards.tsx:24-31` `STATUS_LABEL`), so the same word is spelled three ways across two tables and one frontend map |
| lower-case vs. SCREAMING_SNAKE, same words | `shipping.pickups.status` (`pending`,`scheduled`,`completed`,`canceled`, `000_genesis_schema.sql:2061`+CHECK at `:3397`) vs. `fulfillments.fulfillment_status` (`PENDING`,`SCHEDULED`,`COMPLETED`) - and the two tables are both named "pickups," for genuinely different things (carrier truck pickup scheduling vs. the operator's customer-pickup handover) |
| "Sent" vs. "sent" | `payments.transfer_state.'Sent'` (payout) vs. `media.email_status.'sent'` - unrelated concepts, coincidentally homographs one Title Case, one lower |
| `fulfillment_status` mixed across kinds | `PICKED_UP` is meaningful only for `PICKUP`; `DROPPED_OFF` only for `DROPOFF`; `IN_PROGRESS` only for `DIRECT` (appointment) - one enum, three kinds, and `transitionsFor` (`logistics/fulfillments/rules.ts:25-42`) has to branch on `category` to know which subset of the enum's own values are legal, which is a state machine hiding inside a value list |
| `isSettled` defined twice | `transactions/rules.ts:29-31` and `orders/rules.ts:107-109` - identical bodies (`status === 'succeeded' \|\| status === 'processing'`), two copies |
| direction vocabulary: purchase/sale vs. buy/sell | `orders.direction` is `purchase`/`sale`; `refining.direction` is `sell`/`buy` - both describe "which way the money and metal move for Dorado," in different words, on adjacent tables the same screen displays together |
| two direction enums, one vocabulary | `crm.sms_direction` and `crm.call_direction` are both exactly `inbound`/`outbound` - two Postgres types for one concept |
| "state" the US state vs. "state" the workflow state | `places.addresses.state` (`000_genesis_schema.sql:1623`, e.g. `'TX'`) has nothing to do with any status - flagged only because the word collides in a codebase full of workflow "state" |

## Section 3: the proposed centralized set

Casing convention: Title Case with spaces for every stored or derived label a
human reads (matches the majority - `payments.transfer_state`, `refining`
order `state`, `shipping.shipments.shipping_status` already use it). Enum
identifiers that are pure internal selectors (not read on a screen) keep their
existing case and are out of scope for renaming.

| entity | field (stored) or derivation | values (one casing) | Figma badge language |
|---|---|---|---|
| Order (any kind) | stored: `status` = `draft` \| `open` \| `cancelled` (new, minimal) | — | `Cancelled`: Danger. `Draft`: Neutral Outline. `Open`: not itself badged - the derived display state is what shows |
| Order - derived display state | derive from: payout/charge `state` + fulfillment state + lot positions (see ladder below) | see per-kind ladder | Warning -> Info -> Success, pre -> mid -> post |
| Order (customer purchase) display ladder | derived | `Awaiting Receipt` -> `Awaiting Payout` -> `At Refiner` -> `Ready to Pay` -> `Completed`, or `Cancelled` at any point | Warning / Warning / Info / Info / Success; Danger for Cancelled |
| Order (customer sale) display ladder | derived | `Awaiting Payment` -> `Preparing` -> `In Transit` -> `Completed`, or `Cancelled` | Warning / Warning / Info / Success; Danger |
| Order (refiner sale, we send scrap out) display ladder | derived from `refining.orders`' own fields (unchanged - already correct) | `Pending Assay` -> `Settled`, or `Disputed`, or `Cancelled` | Warning / Success; Danger; Neutral Outline |
| Order (refiner purchase, we buy bullion in) display ladder | derived | `Awaiting Delivery` -> `Awaiting Payment` -> `Completed`, or `Cancelled` | Warning / Warning / Success; Danger |
| Lot | derive: `position` | `Incoming`, `On Hand`, `At Refiner`, `Pooled`, `Sold`, `Consumed` | Warning / Info Soft / Info Outline / Success Soft / Success Solid / Neutral Outline (unchanged from `orders-lots-proposal.md:59-66`) |
| Payment (payout) | stored: `payments.transfers.state` (unchanged - already one clean ladder) | `Not Sent` -> `Processing` -> `Sent`, or `Failed` | Warning / Info / Success; Danger |
| Payment (charge) | stored: `payments.transfers.state` (same column, `kind = charge`) | `Due` -> `Processing` -> `Received`, or `Failed` | Warning / Info / Success; Danger |
| Fulfillment - shipment | stored: `shipping.shipments.shipping_status` (unchanged - already Title Case, already one ladder) | `Label Created` -> `In Transit` -> `Delivered`, or `Cancelled` | Warning Outline / Info / Success; Danger |
| Fulfillment - pickup | stored: `fulfillments.fulfillments.status`, filtered to the pickup subset | `Scheduled` -> `In Transit` -> `Picked Up` | Warning / Info / Success |
| Fulfillment - appointment | stored: same column, appointment subset | `Scheduled` -> `In Progress` -> `Completed` | Warning / Info / Success |
| Fulfillment - drop-off | stored: same column, drop-off subset | `Scheduled` -> `In Transit` -> `Dropped Off` | Warning / Info / Success |
| Fulfillment - return shipment | stored: `shipping.shipments.shipping_status`, `direction = 'Return'` | `Label Created` -> `In Transit` -> `Returned` | Warning Outline / Info / Success |
| Fulfillment - linked/drop ship | none (pointer only) | `Drop Ship` | Neutral Outline |
| Settlement (refiner) | derive (unchanged) | `Pending Assay`, `Settled`, `Disputed` | Warning / Success / Danger |
| Spots | stored: `spots_locked` + `total` presence (unchanged) | `Unlocked`, `Locked`, `Finalized` | Warning / Info / Neutral Outline |

**One generic ladder, plus a kind?** Yes for pickup/appointment/drop-off: all
three are `Scheduled -> In Transit -> Done`, and only the label of "Done"
differs (`Picked Up` / `Completed` / `Dropped Off`). This is a rename of the
existing `fulfillments.fulfillment_status` values into Title Case, not a
schema change - the enum can keep three transitional names if the label
table maps them, or the values themselves can become the display words. See
"Changes this implies" below for the concrete choice.

**Order stored set, justified**: `draft` covers an admin-created order not
yet placed (if that ever exists distinctly from placement); `open` covers
everything in progress, letting the derived ladder do the talking; `cancelled`
is the one decision no other row records. This is smaller than today's five
purchase / four sale values, because today's in-between values (`Received`,
`Payment Processing`, `Preparing`, `In Transit`, `Completed`) are all
re-derivable from payment + fulfillment + lot facts that already exist.

### Changes this implies

- `orders.orders.status` narrows from free text to a 3-value enum
  (`draft`/`open`/`cancelled`); every current in-between value is computed
  by a new SQL view field, on the model of `refining.orders`' `state`.
- `OrderActions.statuses` (the advisory ladder) is dropped - nothing reads it.
- A "received" signal is added somewhere (a fulfillment fact, most likely -
  see Section 4) so `on hand` is derivable and so is a purchase order's
  `Awaiting Payout` step.
- `fulfillments.fulfillment_status` values are relabeled Title Case
  (`Picked Up`, `Dropped Off`, `In Progress` stay; `Pending` unifies with
  `Scheduled` or is dropped as a distinct step - see Section 4) so the
  frontend's `STATUS_LABEL` re-spelling map (`ScheduleCards.tsx:24-31`)
  is deleted, not duplicated.
- `isSettled` is de-duplicated into one function, imported by both
  `transactions/rules.ts` and `orders/rules.ts`.
- `orders.direction` and `refining.direction` keep their own vocabularies
  (no change proposed - see Section 4, this one is a judgment call).
- `leads.leads.converted`/`.contacted`/`.responded` merge into one derived
  `lead_stage`; the three booleans stay as the underlying facts (ruling-safe:
  nothing is deleted, a view is added).

## Section 4: open decisions for Jacob

- **Recommend: add a `received_at` (or similar) fact to the inbound
  fulfillment, not to the lot or the order.** Nothing today marks a purchase
  order's metal as arrived, which blocks both `on hand` lot position and any
  derived `Awaiting Payout` order state. Placing it on the fulfillment (which
  already tracks the physical handover) keeps `orders` and `lots` free of a
  column that fulfillments already owns the concept for (ruling 70).
- **Recommend: `combined_into_id` on the parent lots, mirroring
  `split_from_id`.** The alternative (re-reading `split_from_id` as
  "successor") makes one column mean two opposite things depending on
  direction, which is the same kind of ambiguity this whole document is
  trying to remove. `orders-lots-proposal.md:243-247` already flags this as
  unresolved and it should be decided before the position view ships.
- **Recommend: keep `purchase`/`sale` and `sell`/`buy` as two vocabularies.**
  They read from opposite sides of the same transaction (Dorado's customer
  side vs. Dorado's refiner side) and a shared word here risks a screen
  showing "Sale" for a refiner engagement a customer never sees. Flagging it
  only because Section 2/Q5 found it, not because the evidence says to merge
  it.
- **Undecided: does `fulfillments.fulfillment_status` keep `PENDING` as a
  distinct step, or collapse into `SCHEDULED`?** Pickup and drop-off already
  gate their first transition on a schedule existing (`transitionsFor`
  returns `[]` until `start_time` is set), so `PENDING` may never be a state
  an operator actually sees on those two kinds - only on `DIRECT`
  (appointment), where the design notes' own ladder starts at `Scheduled`
  too. No recommendation - needs Jacob's screen-by-screen check against the
  Figma states.
- **Undecided: should `payments.attempts.status` and
  `payments.intents.status` (Stripe's raw vocabulary) become the audit log
  underneath `payments.transfers`, replacing their separate tables, or stay
  parallel?** This document only inventories what exists; combining
  Stripe-specific payment intents with the newer, rail-agnostic
  `payments.transfers` is a bigger structural question than a status rename
  and is out of scope here.
