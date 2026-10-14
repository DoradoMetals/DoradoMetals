# Orders port review: cross-cutting

Read 2026-10-14 against `dev` @ `06d8bedd` in this worktree. Figma file `ymmNlCDLVIfanpRQ7QHMIs`, read live with
`get_metadata` and `get_screenshot` (hidden nodes left out). `get_design_context` was NOT called: the
`figma-design-to-code` skill is not in this session's skill list, and nothing here generates code.
Paths: `API` = `api/src`, `C` = `packages/contracts/src`, `G` = `api/migrations/000_genesis_schema.sql`.

**Source note.** `docs/rulings.md` stops at 96 ("Every number from 1 to 96 has an entry", line ~350). Rulings
97-126 exist only in lane docs: 112-114 in `docs/waves/facts-and-positions.md:1-15`, 117 (arrival) in
`api-gaps-orders.md:23-26`, 120-121 in FOLLOWUPS "The lot model", 123/125 in `api-gaps-orders.md`, 124 and 126
in the comment logs. The law file is behind the law.

`docs/design/statuses.md` is stale: its §1 row 30 still describes a stored free-text `orders.orders.status`.
Migration 181 dropped that column; the state is now derived (§3 below).

---

## 1. The shared shell, mapped to the API

One line per element: the design source, what supplies it, or GAP.

### 1.1 Entity Header (library `Entity Header`, placed as `1108:22878`, `1108:22934`, `1104:22886`, `1106:22874`)

| element | node | supplied by | status |
|---|---|---|---|
| Eyebrow PURCHASE ORDER / SALES ORDER | `1108:22878`, `1108:22934` | `OrderView.order.direction`; `RefiningOrderView.direction` | supplied |
| Name (customer or refiner) | same | `OrderView.user.name`; `RefiningOrderView.refiner` | supplied |
| `PO-2481 · Austin, TX`, `RS-2493 · Dallas, TX` | same | `OrderView.reference` (`API/db/orders/sql/view.sql`); refiner `CASE ro.direction` prefix in `view_one.sql`/`view_all.sql` | supplied |
| `7 orders to date` / `12 orders to date` | same | `OrderViewUser.orders_to_date` (`C/computed/orders.ts:75`); `RefiningOrderView.orders_to_date` | supplied |
| Order State badge | `1104:22886` (Pending Assay), 834:21175 header (Ready to Pay) | `OrderView.state`, `RefiningOrderView.state`, one enum `OrderState` (`C/computed/orders.ts:5-20`) | supplied; see §3 |
| No badge on Jacob's 4 base customer headers | `1108:22878`, `1108:22977` (`Show badge` false, comments log line 276) | the API always returns `state` | RULING: the port shows the badge always, or never on base screens |
| Assigned to (customer) | `1108:22878` | `orders.orders.assigned_to_id` (G:1810ff), `OrderPatch` (`C/orders/orders.ts:97`), options `GET /api/employees` | supplied |
| Assigned to (refiner) | `1108:22934` | `refining.orders.assigned_to_id` (G:2741ff), `RefiningOrderPatch.assigned_to_id` (`C/refining/orders.ts:48`) | supplied |
| Identity slot: Refiner + Location selects (drafts) | `1102:22810` on `396:4895`, `380:4833` | `RefiningOrderPatch.refiner_id`, `.location_id`; `GET /api/locations` | supplied |
| Edit row: `Edit` + `Cancel` | `1104:22886` | `PATCH /api/refining/orders/:id` (`API/domains/refining/routes.ts:42`); `cancel` action (`refining/rules.ts:267`) | supplied (refiner only; no customer Edit drawn) |
| Primary `Finalize` (customer) | `1108:22878` and 834:21175 header | action `finalize` offered only while `!spots_locked` (`API/domains/orders/rules.ts:188-190`) | CONFLICT: 834:21175 is badged `Ready to Pay`, which `order_state.sql:62-71` emits only when finalized, so the API offers no `finalize` there |
| Primary `Send` (refiner) | `1108:22934` | action `send` when `sent_at IS NULL` (`refining/rules.ts:262`) | supplied |
| Cancel (customer) | `1108:22878`, `1108:22977` | action `cancel`: purchase only, with an address (`rules.ts:186`); `POST /api/orders/:id/cancel` (`routes.ts:64`) | GAP for a sale: the button is drawn on SO-1112 `1108:22977`, but no sale cancel exists |

### 1.2 Documents card (library; placed `25:425`, `358:4907`, `320:2731`, `719:15343`)

| element | node | supplied by | status |
|---|---|---|---|
| Rows per fulfillment kind | `25:425` | `GET /api/orders/:id/documents` → `OrderDocument[]` (`routes.ts:46`, `rules.ts:248-285`) | supplied |
| Refiner rows `Invoice`, `Settlement` | `320:2731`, `719:15343` | `GET /api/refining/orders/:id/documents` (`refining/routes.ts:48`), `refining/rules.ts:282-296`, migration 264 | supplied |
| Header `5 documents` (= row count, comments log line 248) | `25:425` | `OrderDocument[].length` | supplied |
| Stored row `PDF · 31 KB · Sep 1, 2026` | `25:425`, `358:4907` | `media.pdfs.size_bytes`, `.created_at` (G:1706) exist; `OrderDocument` carries only `kind, name, available, pdf_id` (`C/computed/orders.ts:63-70`) | GAP: add `size_bytes`, `created_at`, `created_by_id` to `OrderDocument` |
| Row state `Ready to generate` | `25:425` (Shipping Instructions) | `available && pdf_id === null` | supplied (derivable) |
| Row state `Not yet available` | `25:425` (Invoice, Return Shipment Manifest) | `available === false` | PARTIAL: `return_packing_list` is always `available: true` (`rules.ts:281`), even with no Return leg |
| Row state `Awaiting refiner · Import` | `719:15343` | refiner `available: held !== null` for non-renderable kinds | supplied |
| Send (paper plane) | `25:425`, `358:4907` | `POST /api/orders/:id/documents/:kind/send` (`routes.ts:47`, `documents/pdfs/delivery.ts:52`) | supplied (customer orders) |
| Send on a refiner Invoice | `320:2731`, `719:15343` | none; deliberately absent (`docs/waves/admin-orders-api.md` "What is still open") | DRAWN, NOT BACKED: remove the icon or rule it in |
| Download | `25:425` | `POST /api/pdf/generate_<kind>` × 10 (`documents/pdfs/routes.ts:20-29`), streams bytes | PARTIAL: no download for an imported kind (`settlement`, `lot_manifest`), none for any refiner-order document, and no `GET …/documents/:kind` |
| Delete (red bin) | `25:425`, `358:4907`, `320:2731` | none for orders; leads have `DELETE /api/leads/:id/documents/:pdfId` (`crm/lead-documents/routes.ts:14`) | GAP, and RULING (see §4 "documents") |
| Import (file-plus) | `25:425`, `358:4907` | `POST /api/orders/:id/documents/:kind` multipart (`routes.ts:48-53`); refiner `refining/routes.ts:49-54` | supplied |
| Who sent it, when | none drawn | `media.emails` has `sent_at`, `pdf_id`, `user_id` = recipient; no actor column (`API/db/crm/activity/sql/list.sql` header says the email actor is nobody) | GAP if wanted |

### 1.3 Chat card (library `Chat` 649:101; placed `148:553`, `358:4908`)

| element | node | supplied by | status |
|---|---|---|---|
| Messages view, bubbles, `2:14 PM · Delivered` | `148:553` | `GET /api/sms?user_id=` (`crm/sms/routes.ts:6`) → `SmsMessage[]`, `status` enum `crm.sms_status` | supplied; no pagination (`conversation.sql` has no LIMIT) |
| Composer `Text the customer…` | `148:553` | `POST /api/sms { user_id, body }` (`SmsSendBody`) | supplied |
| Attach (MMS) | `148:553` | `media` on `SmsSendBody`; upload via `POST /api/images` presign (`accounts/images/routes.ts:9`) | supplied |
| Switcher icons (message, phone) | `148:553` header | Calls: `GET /api/customers/:id/timeline` (`crm/timeline/routes.ts:6`) with `call_kind`; `POST /api/calls/token` | supplied; timeline has no LIMIT (`for_customer.sql`) |
| Call Event view | not placed on any Orders screen read (only Messages view is drawn) | `CallKind` (`C/computed/crm.ts:52`) | supplied; design not drawn here |
| Scope: per customer, not per order | `148:553` | `crm.sms_messages` (G:1135) and `crm.calls` (G:1035) have `user_id`, no `order_id` | by default ruling (api-gaps-orders §3 Q7): customer thread; card says nothing about it |
| Chat on refiner orders | absent on `320:2717`, `358:6416` | refiner is an organization, no `user_id` thread | consistent |
| Consent line | not drawn on Orders | `crm.sms_consent_events` (G:1093); ruling 126 recorded, not enforced | n/a |

### 1.4 Photo viewer pattern

| element | node | supplied by | status |
|---|---|---|---|
| Thumbnail placeholder in a lot tile | Order Card lot rows on `620:5115` (`620:5300` …) | `inventory.lots.image_id` (G:1382), `LotPatch.image_id` (`C/inventory/lots.ts:53`) | PARTIAL: ONE image per lot |
| Open one, see the whole set | queued, not drawn (comments log line 285; library Photo Viewer from People `281:9538`) | none | GAP: no set per lot or per order; `media.images` (G:1679) links only `user_id` |
| Fetch the image | n/a | `GET /api/images/:id/url` → `getUrlFor` returns 404 unless `img.user_id === caller` (`accounts/images/service.ts:48-66`, `controller.ts:18-22`) | GAP: an admin cannot open a photo another admin or the customer uploaded |
| Intake photos | none drawn | `POST /api/images` (requireUser) + `PATCH /api/orders/lots/:id { image_id }` | PARTIAL: one photo, uploader-only read |

### 1.5 Selection actions `1035:21970` and the Filter Bar

| element | node | supplied by | status |
|---|---|---|---|
| `Batch into` select, value `Elemetal · Dallas` | `1035:21970`; placed `620:5758`; mobile label `Send to` on `917:13005` | `POST /api/refining/orders/batch` (`refining/routes.ts:40`), `RefiningBatch {refiner_id, lot_ids?, order_ids?}` (`C/refining/orders.ts:78-81`) | PARTIAL: the value is refiner + LOCATION; `RefiningBatch` has no `location_id`. Two labels for one control |
| `Batch` | `1035:21970` | same; `order_ids` expand server side | supplied (`order_ids` is typed `Lot.shape.id`, `C/refining/orders.ts:81`, cosmetic) |
| `2 orders selected · 10 lots` / `$15,532.70 est. · 6.18 oz fine gold · …` | `620:5758`, `917:13005` | list items carry `lot_count`, `estimated_value`; no fine oz per metal | GAP: summing in the browser breaks ruling 75. Wants one pricing read over the selected ids |
| Any other bulk action (assign, cancel, export, print) | not drawn | nothing takes an array of order ids except batch | none drawn, none built |
| Filter Bar (proposal A) `Showing Customers/Refiners · Show · Assigned to · Sort by · counts · Reset` | `626:11861` | `GET /api/orders` `has_unassigned_lots`, `assigned_to_id` (+`unassigned`), `sort`, `limit/offset`, `counts` (`orders/controller.ts:45-70`); `GET /api/orders/sorts` (`routes.ts:37`, migration 260) | supplied for customers |
| `Refiners` toggle | `626:11861`, `715:38985` | `GET /api/refining/orders?refiner_id&direction&state` (`refining/routes.ts:38`) | PARTIAL: no pagination, no counts, no `assigned_to_id`, no sort |
| State chip rows (Purchases 5, Sales 4, plus All) | `715:38985`, placed `673:20375` | `GET /api/orders?state=` repeatable, same `/*__order_state__*/` fragment | supplied; no `Cancelled` chip on either row, so cancelled orders show only under All |
| Search `Search orders, customers, lots…` | `687:13885` (Admin Header) | `GET /api/search?q=` (`orders/search/routes.ts:8`, `API/db/orders/sql/search.sql`) | PARTIAL: refiner orders not searched (RS-/RP- typed are stripped, only `orders.orders` scanned); no tracking number or phone; LIMIT 50, no offset |
| Mobile list lacks the Customers/Refiners toggle | `917:13005` | n/a | DESIGN parity gap |

### 1.6 Order Context Menu `619:4750`

| element | node | supplied by | status |
|---|---|---|---|
| Items `ORDER PO-2189 · Edit details ⌘E · Edit details ⌘E · Delete address` | `619:4750` → `619:4751` | library Menu defaults; no order action is named | NOT DESIGNED: the menu holds placeholders. Wants a list of actions, each one `Action.name` from `OrderView.actions` (an order has no delete) |

### 1.7 Drawer (library, right-anchored; Full on mobile, comments log line 303)

| element | node | supplied by | status |
|---|---|---|---|
| Adopt refiner assay, LG | `729:35427` (`1160:22722`); mobile `729:36280` (`1160:23218`) | `GET`/`POST /api/orders/:id/adopt_assay` (`orders/routes.ts:67-68`) | supplied (row contents: purchase reviewer) |
| Match settlement lines, MD | `719:16814` (`1160:22869`); mobile `721:17220` (`1160:23348`) | `GET /api/refining/orders/:id/settlement-lines` (`refining/routes.ts:55`) | supplied (row contents: refiner reviewer) |
| Confirm reason in a drawer | not drawn | `settle` carries `settlementConfirm ?? premiumConfirm` (`refining/rules.ts:264`) | GAP in design: the reason has nowhere to render |
| Old dialog sets `729:17608`, `710:49549` | 0 instances | n/a | waiting on Jacob to delete |

### 1.8 Payout override dialog bodies `1088:22538`, `1088:22690`

| element | node | supplied by | status |
|---|---|---|---|
| `Record a second payout?` | `1088:22690` (desktop and mobile) | `openPayout` `second` (`transactions/payouts/service.ts:51-55`); `sendPayout` `overrideFor` (`rails/rules.ts:138-141`) | supplied at request time |
| `Payout is above the order total?` | `1088:22690` | `payoutOverrideFor(owed, body.amount)` (`rails/rules.ts:143-147`) | UNREACHABLE: the Payment card draws no amount input, and `amount` defaults to `owed` |
| Reason, `Required · at least 10 characters` | `1088:22538` | `assertOverrideReason` (`rails/rules.ts:125-136`); `payments.transfers.override_reason` (migration 182) | supplied |
| `You will be asked to re-authenticate` | `1088:22538` | `POST /api/account/step_up` (`accounts/auth/routes.ts:31`); `assertSteppedUp` → 403 `step_up_required` | supplied |
| Knowing in advance that a dialog is needed | n/a | customer `send_payment` is `offer('send_payment', payoutConfirm(view))`, override always null (`orders/rules.ts:200-202`); refiner `send_payment` has `sendPaymentOverride` (`refining/rules.ts:270`) | GAP: the customer screen learns only from the 409 text |
| Refiner payout override recorded | n/a | `openRefiningPayout` writes `override_reason: null` and checks nothing (`payouts/service.ts:88-115`) | GAP: asymmetric with the customer path |
| Credit-twice override (`add_funds`) | no dialog drawn | `assertCreditOverride` (`orders/rules.ts:395-409`) | drawn nowhere |

---

## 2. Statuses: every label drawn, against the facts

Ruling 112: labels are decorative, the database stores facts. The order state is one `CASE` in
`API/db/orders/sql/order_state.sql` (customer) and `API/db/refining/orders/sql/refining_state.sql` (refiner),
both typed by `OrderState` (`C/computed/orders.ts:5-20`, 14 values = the 14 variants of `664:12789`).

| state (variant node) | kind | derived from (SQL) | status |
|---|---|---|---|
| Cancelled `664:12778` | all | `o.cancelled_at IS NOT NULL` (`order_state.sql:12`); `ro.cancelled_at` (`refining_state.sql:88`) | supplied |
| Awaiting Receipt `664:12714` | purchase | `NOT fulfillments.arrivals.arrived` (`order_state.sql:50-51`, view from migration 185) | supplied |
| At Refiner `664:12725` | purchase | any lot with a `batch` edge to a refiner order sent, unsettled, uncancelled (`:52-61`) | supplied |
| Awaiting Payout `664:12720` | purchase | NOT (`spots_locked` AND `transactions.total` set), i.e. not finalized (`:62-65`) | supplied; the LABEL means "not finalized", see rulings |
| Ready to Pay `664:12731` | purchase | finalized and no `payout` transfer `Sent`/`Received` and no `ledger` Credit (`:66-71`) | supplied |
| Completed `664:12767` | purchase | any Sent/Received payout or a ledger Credit (`:72`) | WRONG for a partial payout: one Sent transfer of any amount reads Completed |
| Awaiting Payment `664:12736` | sale | no Received charge, no succeeded/processing intent, `post_charges_amount > 0` (`:15-23`, `:46`) | supplied |
| Preparing `664:12741` | sale | paid, not shipped (`:44`) | supplied |
| In Transit `664:12746` | sale | `order_sent` or fulfillment `IN_TRANSIT` or outbound shipped/tracked (`:35-43`) | supplied |
| Completed (sale) | sale | fulfillment `PICKED_UP/COMPLETED/DROPPED_OFF` or outbound `delivered_at` (`:26-34`) | supplied |
| Draft `664:12783` | refiner | `ro.sent_at IS NULL` (`refining_state.sql:91`) | supplied; customer orders never emit Draft (every row is placed) |
| Pending Assay `664:12751` | refiner sell | sent, not settled (`:97`) | supplied; the Settlement card badge says `Pending assay` (`719:15342`, `320:2728`) while the header says `Pending Assay` (`1104:22886`). Design casing drift; the API emits one spelling |
| Awaiting Delivery `664:12756` | refiner buy | sent, no arrival (`:92-95`) | supplied |
| Awaiting Payment (refiner) | refiner buy | arrived (`:96`) | supplied, BUT a buy order never leaves it: no `Completed` rung after the refiner is paid |
| Settled `664:12761` | refiner | `ro.settled_at` (`:90`) | supplied |
| Disputed `664:12772` | refiner | `ro.disputed_at` (`:89`) | supplied in the API (`dispute` action, `refining/rules.ts:266`); Jacob ruled no Dispute button, so no screen reaches it |
| Frame `358:6416` named `· Sent` | refiner buy | the API says `Awaiting Delivery` | frame name only, no badge drawn |

Other badges drawn on the shared shell:

| label | node | fact | status |
|---|---|---|---|
| Old Order Card `Not sent`, `Sent` + `In Transit`, `Delivered`, `Picked Up`, `Not set` | `620:5300`-`620:5685` | payout `payments.transfers.state`, `shipping.shipments.shipping_status`; the list item carries neither | superseded by the proposed card `671:28586` (one state badge); port the proposal |
| Payment `Not sent` | 834:21175 Payment | `payments.transfer_state` (G:308-326) | supplied; `Failed` is never drawn |
| Shipment `Delivered`, Tracker `Arrived` | 834:21175 Shipment | `shipping_status`; FedEx `AR → 'Arrived'` (`providers/fedex/constants.ts:63`, `logistics/shipping/rules.ts:243`) | supplied |
| Lot position (tile dim or `on RS-2493`) | Order Card lot rows | `position.sql` (`incoming`, `on hand`, `at refiner`, `pooled`, `sold`, `consumed`), `Position` (`C/inventory/lots.ts:80`) | supplied; lower case in the contract, not drawn as a badge |
| Spots lock icon | 834:21175 Spots | `orders.orders.spots_locked`, `actions.lock_spots/unlock_spots` | supplied |

Contradictions inside one frame (834:21175 `PO-2481 · Profit Breakdown`, badge `Ready to Pay`): the header
offers `Finalize` (API: not offered once finalized); Documents says Invoice `Not yet available` (API:
`FINALIZED` kinds are available once finalized, `orders/rules.ts:243,281`); `Send payment` is disabled (API:
`send_payment` is offered whenever a total exists, `rules.ts:200`).

---

## 3. Missing across the product (operator view)

| # | need | why | API today |
|---|---|---|---|
| 1 | Audit trail per order (who changed what, when) | two employees touch one order over weeks; money moves on it | Only last-writer stamps: `audit_stamp()` (`migrations/116…sql:79`) fills `created/updated_*_id`. No order history table, no `GET …/activity`. Partial facts exist: `payments.transfer_events`, `transfers.override_reason`, `media.pdfs.created_by_id`, `media.emails.sent_at`, `crm/activity` (person-scoped, `API/db/crm/activity/sql/list.sql`). GAP |
| 2 | Notes on an order | handover between employees | `orders.orders.notes` is ONE text column (G:1815), patchable (`OrderPatch`), redacted for customers (`rules.ts:225-233`). No author, no time, not drawn. `crm.notes` (G:1074) has author and time but keys on `user_id`/`lead_id`, no `order_id` |
| 3 | Refunds and chargebacks | a card sale can be refunded or disputed by the bank | `grep -rniE "refund|chargeback"` finds no Stripe refund call, no dispute webhook, no state. GAP |
| 4 | Partial payouts and the two-payout override reason | split wire, or a correction after a short payment | Second payout = override + step-up, stored on the transfer (`payouts/service.ts:49-80`). The order state reads Completed after ANY Sent payout. No sum of paid vs total anywhere in the view. GAP |
| 5 | Cancelled and expired orders, credit release | ruling 88: reservation released on cancel and on expiry | Expiry: `sweeps.ts:46` releases the reservation for abandoned sales. Cancel: purchase only (`assertDirection`, `orders/service.ts:248`); a SALE has no admin cancel, so ruling 88's "released by cancel" has no route. Reopen = `PATCH { cancelled_at: null }` (`service.ts:43`, `rules.ts:424`) |
| 6 | Address change after a label exists | customer moves or typos | `orders.addresses` is a snapshot with no write route (`orders/addresses/routes.ts:9`); `ShipmentPatch` is `carrier_service_id` only. Path today: void label (`POST /api/shipping/cancel_label`) and nothing to re-address. GAP |
| 7 | Lost or damaged parcels, insurance claims | insured parcels of metal go missing | `insured`, `declared_value`, `additional_coverage` on `shipping.shipments`; no claim row, no state, no route (`grep claim|lost|damaged` hits only `claimOwner`). GAP |
| 8 | Lot photos on intake | proof of what arrived; dispute evidence | one `image_id` per lot, uploader-only URL (§1.4). GAP |
| 9 | Scrap test results and disputes | customer contests purity | `declared_*` frozen beside measured (migration 178), `assayed_at`, `declared_content` give the variance; no customer-dispute fact (`disputed_at` is refiner-only). Variance supplied, dispute GAP |
| 10 | Customer-visible vs admin-only facts | ruling 3: customers have zero order-management options | `GET /api/orders/:id` for an owner strips only `notes` and `assigned_to_id` (`rules.ts:225-227`). `actions`, with confirm text such as "Refiner has not settled 2 of 5 lots", reaches the customer. LEAK |
| 11 | Permissions | | Writes all `requireAdmin`; reads `requireUser + requireOwnOrderParam` (`orders/routes.ts:35-72`); `POST /api/pdf/generate_*` is requireUser with entitlement in `serve.ts:59-63` but no `available` check, so an owner can render an unfinalized invoice |
| 12 | Concurrency: two admins on one order; stale pricing | last write silently wins on lots, charges, spots | No version or `updated_at` precondition anywhere in orders (`grep FOR UPDATE|if-match|version`); payments only have `assertWritten`. `addFunds` checks `hasCreditFor` outside its transaction (`service.ts:230` vs `:236`), so two clicks can credit twice. Pricing: unlocked orders price at live spot on every read (by design); no "price changed since you loaded" signal. GAP |
| 13 | Printing and documents regenerated after an edit | an invoice must match the money | `serveOrderDocument` persists the FIRST render and serves the stored copy forever (`documents/pdfs/serve.ts:66-79`; `latest.sql` LIMIT 1). Edit lots after any view → the stale PDF is what downloads and what Send mails. BUG |
| 14 | Search across orders and lots | phone call: "where is my order" | §1.5: no refiner orders, no tracking, no phone |
| 15 | Bulk actions on the selection bar | | Batch only (§1.5); no bulk assign. RULING whether more are wanted |
| 16 | Mobile parity | admins on the floor use phones | Mobile state frames draw header + one card (`834:21442`, `729:36280`); no mobile Documents/Chat/Payment frame placed; mobile list lacks the Customers/Refiners toggle (`917:13005`) |
| 17 | Keyboard and accessibility | | Only `⌘E` on the placeholder menu `619:4750`. No focus order, shortcut map or labels in the file |
| 18 | Empty, loading, error states | ruling 83: every route has `loading.tsx`/`error.tsx` | None drawn for list or detail (the inventory lists no such frame); only the Fulfillment empty slot `209:3010` |
| 19 | Pagination on every list | | Orders list: limit/offset, default 50, total counts (`list.sql`). Refiner list: none. Search: LIMIT 50 only. SMS conversation, customer timeline, inbox, images list: none. Activity: `limit <= 500` |
| 20 | Expected value of a selection; per-lot fine oz | §1.5 | GAP |

---

## 4. Prior audits, cross-cutting items only

`docs/design/api-gaps-orders.md` (2026-10-09):

| item | state | evidence |
|---|---|---|
| §1.1 state chips | closed | `controller.ts:58` `states: statesIn(req)`; `list.sql` WHERE on the fragment |
| §1.2 assigned_to filter | closed | `controller.ts:55-60`, `unassigned` literal |
| §1.3 has_unassigned_lots | closed | `list.sql:54` |
| §1.4 sort | closed | `orders.list_sorts` (migration 260:16-55), `GET /api/orders/sorts`, `assertKnownSort` (`rules.ts:236`) |
| §1.5 counts | closed | `list.sql:33-38,77-78` `counts.orders`, `counts.unassigned_lots` |
| §1.6-1.8 card lots, `lot_count`, `estimated_value`, `arrived_at` | closed | `OrderListItem`/`OrderCardLot` (`C/orders/orders.ts` ~:80-90); migration 261 |
| §1.9 search | closed, partial | `search.sql`; refiner orders missing (§1.5) |
| §1.10 `New lot` | superseded | desktop button gone from `687:13885`; mobile `New order` on `917:13005` → `POST /api/orders/admin` (`routes.ts:39`) |
| §1.11 one OrderState enum (14) | closed | `C/computed/orders.ts:5-20`, `C/refining/views.ts:50` |
| §1.12 refiner Draft | closed | `refining_state.sql:91` |
| §1.23 refiner documents rows | closed | migration 264; `refining/rules.ts:282` |
| §2.10 confirm / override not drawn | partly closed | override dialogs drawn (`1088:22538`); confirm reasons still drawn nowhere; coordinator narrowed ruling 112 to the two payout dialogs (comments log line 220) |
| §2.15 Documents names, Assay Results row | closed in design | `25:425` reads Shipment Manifest, Return Shipment Manifest, Assay Results; API name is `Quote Estimate` (`rules.ts:245`). Name drift: OPEN |
| §2.16 selection label | open | `Batch into` on `1035:21970`/`620:5758`, `Send to` on `917:13005`; `order_ids` closed (`C/refining/orders.ts:81`) |
| §3 Q1 customer Draft | default in force | no customer Draft emitted |
| §3 Q7 messages per order | default in force (customer thread) | no `order_id` on `crm.sms_messages`/`crm.calls` |
| §3 Q8 one search endpoint | closed | `GET /api/search` |
| §3 Q10 Title Case | closed in API, open in design | `refining_state.sql:81-82`; `Pending assay` on `719:15342` |
| §3 Q12 no chip counts | default in force | chips carry no counts on `715:38985` |

`docs/waves/admin-orders-screen-gaps.md` (Step 0) and `docs/waves/admin-orders-api.md`:

| item | state | evidence |
|---|---|---|
| GAP 1 reference | closed | `view.sql` `reference` |
| GAP 2 orders to date | closed | `OrderViewUser` (`C/computed/orders.ts:75`) |
| GAP 18 employees | closed | `GET /api/employees` (`accounts/employees/`) |
| GAP 23 six renderers | closed since | `generate_pickup_manifest`, `_intake_receipt`, `_shipping_instructions`, `_pickup_instructions`, `_appointment_instructions`, `_assay_results` (`documents/pdfs/routes.ts:24-29`); `settlement`, `lot_manifest` still import-only |
| GAP 24 send | closed | `routes.ts:47` |
| GAP 25 import | closed | `routes.ts:48-53`, `refining/routes.ts:49-54` |
| GAP 26 refiner documents | closed | `refining/routes.ts:48` |
| GAP 27 send SMS | closed | `POST /api/sms` |
| GAP 28 MMS | closed | `SmsSendBody.media` |
| GAP 29 call kinds | closed | `CallKind`, `CustomerTimeline.call_kind` |
| "Send on a refiner order is deliberately absent" | open conflict | design draws it on `320:2731`, `719:15343` |
| "Sending an imported document cannot be exercised in a test" | open | unchanged |

`docs/waves/orders-reads.md` cross-cutting scope items 1 (list), 3 (search), 4 (OrderState): all merged (`77871d8b`, migrations 260-265).

---

## 5. Ranked API changes (smallest honest change each)

1. **Stop leaking order actions to customers.** `orderViewForCustomer` (`orders/rules.ts:225`) also sets `actions: []`. Ruling 3. One line plus a test.
2. **Stop serving stale PDFs.** `serveOrderDocument` (`documents/pdfs/serve.ts:66-79`) persists only imports and the copy that is SENT; a renderable kind renders fresh on every download. Check `available` before rendering, so an owner cannot render an unfinalized invoice.
3. **Order state on partial payout.** In `order_state.sql:66-71`, compare `sum(amount)` of Sent/Received payouts (plus Credit) with `orders.transactions.total`, not `EXISTS`.
4. **Refiner buy reaches Completed.** Add `WHEN ro.direction = 'buy' AND <payout to refiner Sent> THEN 'Completed'` in `refining_state.sql` before `Awaiting Payment`.
5. **Customer `send_payment` override text.** `orders/rules.ts:201`: pass the "already has a … payout" reason as `override`, mirroring `refining/rules.ts:270`. Also record and check the reason on `openRefiningPayout` (`payouts/service.ts:88-115`).
6. **Image access for admins, and a photo set.** `getUrlFor` lets an admin through (`images/service.ts:48-66`). Set: a link table `inventory.lot_images (lot_id, image_id, sort_order)` and one read returning presigned URLs per lot; needs the ruling below.
7. **`OrderDocument` facts.** Add `size_bytes`, `created_at`, `created_by_id` from the stored row (the drawn `PDF · 31 KB · Sep 1, 2026`); `return_packing_list` is available only when a Return leg exists.
8. **One download route.** `GET /api/orders/:id/documents/:kind` and `GET /api/refining/orders/:id/documents/:kind`, which stream the stored row or render, so imported kinds and refiner documents can be downloaded.
9. **Cancel a sale.** Extend `POST /api/orders/:id/cancel` to sales: set `cancelled_at`, release the credit reservation (ruling 88), cancel the open intent, with no return leg.
10. **Optimistic concurrency.** Add an optional `expected_updated_at` on `OrderPatch`, `OrderLotPatch` and `RefiningOrderPatch`; the update SQL adds `AND updated_at = $n`, and `assertWritten` returns a 409. Lock the balance row inside `addFunds`' transaction (`balance_for_update.sql` exists).
11. **Selection summary read.** Pricing owns `GET /api/pricing/selection?order_ids=`, which returns `lot_count`, `estimated_value` and fine oz per metal (ruling 75). Add `location_id` to `RefiningBatch`.
12. **Refiner list parity.** Add `limit/offset`, `counts`, `assigned_to_id` and `sort` on `GET /api/refining/orders`. Add `refining.orders` to `search.sql`, and tracking number and phone to it.
13. **Pagination** on `GET /api/sms`, `GET /api/customers/:id/timeline` and `GET /api/inbox` (`limit` plus a `before` cursor on `at`).
14. **Per-order activity read.** `GET /api/orders/:id/activity`: one SQL union over facts that already exist (order and lot stamps, transfers with `override_reason`, `transfer_events`, `media.pdfs`, `media.emails`, refining sends and settles). Field-level "what changed" needs a history trigger on the pattern of migration 242. The ruling below decides it.

## 6. Rulings Jacob must make before the port

1. **Write rulings 97-126 into `docs/rulings.md`.** The law file stops at 96.
2. **Header badge.** Do the four base customer headers show the state badge (the API always has one), or not?
3. **`Awaiting Payout` means "not finalized".** Keep the label, or rename it (for example `Awaiting Pricing`)? Chip order on `715:38985` (Payout before At Refiner) differs from the SQL precedence.
4. **A Cancelled chip** on the state rows, or All only?
5. **Partial payouts.** Are they a business case (then rank 3 and an amount input on the Payment card), or is the "above the total" dialog `1088:22690` unreachable by design?
6. **Admin cancel of a sales order** (ruling 88's cancel half).
7. **Document delete.** `media.pdfs` rows are the record of what was sent. Is delete allowed only for an unsent import, or is it a supersede that keeps the row?
8. **Refiner document Send.** Keep the drawn icon (then build it), or remove it (ruling 15)?
9. **Photos.** One per lot or a set? Per lot or per order? Who may view them (rank 6)?
10. **Order audit trail.** A read over the existing facts (rank 14) is enough, or field-level history (a trigger table)?
11. **Notes.** Keep the single `orders.orders.notes` text, or add `order_id` to `crm.notes` (author, time, many)?
12. **Messages per order.** Confirm the Q7 default (customer thread). Should the card say so?
13. **Context menu `619:4750`.** Which actions it holds.
14. **Selection bar.** One label (`Batch into` or `Send to`), and any bulk action beyond Batch.
15. **Out of scope or in.** Refunds and chargebacks, parcel claims, address change after a label, customer purity disputes. Each needs a fact before a screen.
16. **Mobile and states.** Are mobile Documents, Chat and Payment, and the empty, loading and error states, designed before the port or by the porter?
17. **Concurrency.** Is the precondition (rank 10) wanted, or is last-write-wins accepted?
