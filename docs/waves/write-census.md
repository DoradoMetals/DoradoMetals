# Write census: every non-GET route in the API

Scope: `api/src/domains/**/routes.ts` (all 41 router files, walked via `Router(` not the
literal filename `routes.ts` — `checkout.routes.ts` doesn't match a naive glob), plus the
8 non-GET routes Express registers directly in `api/src/app.ts` outside any domain router
(4 provider webhooks + Twilio's 4 form-encoded callbacks).

**Count as of 2026-09-11: 115 non-GET routes under `domains/**/routes.ts`** (90 POST, 13
PATCH, 2 PUT, 10 DELETE) **+ 8 in `app.ts`** = **123 total**. The brief's "73 POST / 3 PATCH
/ 1 PUT / 3 DELETE / 80 total" is stale relative to the current tree — restated here as a
fact, not a discrepancy to chase down.

## How to read "client caller found"

Two different things can be true at once and both showed up constantly:

- **`packages/client/src` was not touched by the frontend nuke** (ruling 99 only nuked
  `frontend/app`). So when a domain has **no directory at all** in `packages/client/src`
  (checkout, documents/emails, documents/pdfs, catalog, pricing's action routes, crm/leads,
  crm/reviews, crm/calls) that is a real signal nobody has wired a caller for that surface —
  not an artifact of the nuke. For domains that share one client file across several
  routes.ts files (e.g. `payments/queries.ts` covers banks, charges, details, inbound and
  payouts together), the same logic applies per-*function*: several individual routes in
  that file's domains had no matching wrapper even though sibling routes in the same file
  did (banks' 5 routes, `details` PATCH, `inbound/sync`, `inbound/unmatch`, both stripe
  routes) — called out per-route in the tables below, not assumed from the domain as a
  whole.
- Where a client wrapper **does** exist but no `frontend/app` screen calls it yet (add_funds,
  supply, split-lot, a few payment ops), that half of the signal *is* nuke-shaped: the
  screen hasn't regrown yet. Noted per-route below as "wrapper exists, no UI caller" vs.
  "no wrapper anywhere."
- Either way: **absence of a caller is a candidate signal, never proof.** Scripts, tests,
  and not-yet-written admin tooling can all call an endpoint with no client wrapper.

## Full route table

Legend for **Class**: `CREATE` (POST that inserts, stays) · `ACTION` (stays; disqualifier
named) · `PATCH-OK` (existing PATCH/PUT that is genuinely one row of one table) ·
`PATCH-FLAG` (existing PATCH/PUT that is **not** — a reverse finding, §3) ·
`FOLD` (a POST/PUT that qualifies as a patch candidate, §2) · `PROVIDER` (webhook / pure
provider round-trip) · `COMPUTE` (POST-with-body, zero DB write — not a patch question,
nothing to fold).

### accounts / catalog / crm (25 routes)

| Method · Path | Guard | Writes (verb: table @ file:line) | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/account/send_code` | none | `auth.otp_throttles` upsert+counter, `db/auth/throttles/repo.ts:29,37` | real OTP dispatch via `attempt('auth.sendCode',…)`, `auth/service.ts:144`; Cloudflare captcha check | `auth/queries.ts:31` | ACTION — irreversible send; counter isn't idempotent |
| POST `/api/account/verify_code` | none | `auth.otp_throttles`; branch: `auth.verification`+`auth.sessions`, or `auth.users`+`auth.pending_signups`, `service.ts:254-274` | mints a real session (better-auth); `sendAccountCreated` email, `service.ts:277` | `queries.ts:39` | ACTION — up to 4 tables + a real send |
| POST `/api/account/sign_up` | none | `auth.otp_throttles`; `auth.pending_signups` create, `service.ts:183` | real SMS via `attempt('auth.signUp',…)` | `queries.ts:49` | ACTION — 2 tables + real send |
| POST `/api/account/step_up` | requireUser | `auth.otp_throttles`, `service.ts:339` | mints a real verification code + sends it | `queries.ts:55` | ACTION |
| POST `/api/account/change_email` | requireUser | `auth.otp_throttles`; `auth.pending_changes` create/remove, `service.ts:404` | real code send via `attempt` | `queries.ts:62` | ACTION — 2 tables + send |
| POST `/api/account/change_phone` | requireUser | same shape as change_email | same | `queries.ts:69` | ACTION |
| POST `/api/account/confirm_change` | requireUser | `auth.users`+`auth.pending_changes`+`auth.sessions`+`auth.verification`, `service.ts:438-479` | real takeover-alert send, `service.ts:479` | `queries.ts:77` | ACTION — 4 tables + send |
| POST `/api/images` | requireUser | INSERT `media.images`, `db/media/images/repo.ts:41` | Minio presigned URL only (no store write) | none found | CREATE |
| DELETE `/api/images/:id` | requireUser | DELETE `media.images`, `repo.ts:46` | Minio `removeObject` — irreversible | none found | ACTION (delete) |
| POST `/api/addresses` | requireUser | INSERT `places.addresses` + INSERT `places.user_addresses`, `service.ts:58` | none | none found | CREATE — 2-table insert |
| PATCH `/api/addresses/:id` | requireUser | UPDATE `places.addresses` + UPDATE `places.user_addresses`, conditionally a 2-statement default flip, `service.ts:75` | none | none found | **PATCH-FLAG** — 2 tables/call already; §3 |
| DELETE `/api/addresses/:id` | requireUser | DELETE `places.user_addresses`, conditionally DELETE `places.addresses`, `service.ts:99` | none | none found | ACTION (delete, conditional 2-table) |
| POST `/api/addresses/:id/default` | requireUser | UPDATE siblings (clear) then UPDATE target (mark), `repo.ts:77-84` | none | none found | ACTION — writes more than one row of the table |
| POST `/api/users/:id/credit` | requireAdmin | UPDATE `auth.users.dorado_funds` + INSERT `transactions` ledger, `credit/service.ts:14` | none | none found | ACTION — ledger insert; `add/subtract` op isn't idempotent |
| POST `/api/products` | requireAdmin | INSERT `products.bullion`, `repo.ts:91` | none | none found | CREATE |
| PATCH `/api/products/:id` | requireAdmin | UPDATE `products.bullion` only, `buildUpdate`, `repo.ts:100` | none | none found | PATCH-OK |
| POST `/api/calls/token` | requireAdmin | none | Twilio access-token mint, `service.ts:25` | none found | PROVIDER — no write at all |
| POST `/api/calls/presence` | requireAdmin | none — in-process `Map`, `crm/calls/presence.ts:3` | none | none found | ACTION — no persisted row to key a patch on |
| POST `/api/leads` | requireAdmin | INSERT `leads.leads`, `repo.ts:24` | none | none found | CREATE |
| PATCH `/api/leads/:id` | requireAdmin | UPDATE `leads.leads` only, `buildUpdate`, `repo.ts:33` | none | none found | PATCH-OK |
| DELETE `/api/leads/:id` | requireAdmin | DELETE `leads.leads`, `repo.ts:50` | none | none found | ACTION (delete) |
| POST `/api/reviews` | requireAdmin | INSERT `reviews.reviews`, `repo.ts:29` | none | none found | CREATE |
| PATCH `/api/reviews/:id` | requireAdmin | UPDATE `reviews.reviews` only, `buildUpdate`, `repo.ts:38` | none | none found | PATCH-OK |
| DELETE `/api/reviews/:id` | requireAdmin | DELETE `reviews.reviews`, `repo.ts:55` | none | none found | ACTION (delete) |
| POST `/api/sms` | requireAdmin | INSERT `crm.sms_messages` then UPDATE same row (`markSent`), `service.ts:41,70` | real, billed Twilio send, `service.ts:42` | `crm/queries.ts:28` | ACTION/PROVIDER — new row every call, real send |

### checkout / documents (15 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| PUT `/api/checkout/lots` | requireUser | DELETE+INSERT `checkout.lots` and `lots.items`, `service.ts:158` | none | none found | ACTION — 2 tables, mints new ids every call (not idempotent) |
| DELETE `/api/checkout/lots` | requireUser | DELETE `checkout.lots` + orphan DELETE `lots.items`, `service.ts:186` | none | none found | ACTION (delete, 2 tables) |
| PATCH `/api/checkout` | requireUser | UPDATE `checkout.checkouts` only, `buildUpdate`, `repo.ts:58` | none | none found | PATCH-OK |
| POST `/api/checkout/payout` | requireUser | INSERT then 2×UPDATE `payments.details`; UPDATE `checkout.checkouts` (`payment_details_id`), `service.ts:119` | envelope-seals bank numbers in-DB (no external call) | none found | ACTION — 2 tables; possible duplicate-insert race |
| POST `/api/emails/purchase_order_priced` | requireUser | INSERT `media.pdfs` + INSERT `media.emails`, `emails/service.ts:178` | real Resend send + puppeteer PDF render | none found | ACTION/PROVIDER — irreversible send + 2-table write |
| POST `/api/pdf/generate_*` (10 routes: packing_list, return_packing_list, invoice, sales_order_invoice, pickup_manifest, intake_receipt, shipping_instructions, pickup_instructions, appointment_instructions, assay_results) | requireUser | on cache miss: INSERT `media.pdfs`, `documents/pdfs/serve.ts:82` | puppeteer render + MinIO `putObject` (external, not rolled back by the DB transaction) | none found (any) | CREATE/PROVIDER — identical pattern, no route deviates |

*In passing (belong to orders/refining below, not counted twice here):* `POST /api/orders/:id/documents/:kind` (`importOrderDocument`) and `POST /api/refining/orders/:id/documents/:kind` (`importRefiningDocument`) both `storeUpload` → INSERT `media.pdfs` + MinIO write. **CREATE**, both have live callers (`orders/queries.ts:170`, `refining/queries.ts:157`).

### logistics / fulfillments (9 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/fulfillments/schedule_direct` | requireAdmin | `fulfillments.directs` INSERT-or-UPDATE, one row/table, `directs/service.ts:17` | `emails.sendAppointmentBooked`, after commit | `queries.ts:83` (used) | ACTION — irreversible email is a real consequence of this call |
| POST `/api/fulfillments/schedule_dropoff` | requireAdmin | `fulfillments.dropoffs` INSERT-or-UPDATE, one row/table, `dropoffs/service.ts:21` | none | `queries.ts:97` (used) | **FOLD** — see §2; also duplicates the dropoff branch of the existing PATCH |
| POST `/api/fulfillments/methods/update` | requireAdmin | `fulfillments.methods` UPDATE, one row/table, `methods/service.ts:53` | none | none found | **FOLD** (dead) |
| POST `/api/fulfillments/schedule_pickup` | requireAdmin | `fulfillments.pickups` INSERT-or-UPDATE, one row/table, `pickups/service.ts:17` | `emails.sendPickupBooked`, after commit | `queries.ts:77` (used) | ACTION — irreversible email; write itself matches the PATCH pickup branch |
| POST `/api/fulfillments/cancel_schedule` | requireAdmin | up to 3 tables DELETE (`pickups`/`directs`/`dropoffs`, category-dependent), `service.ts:426-432` | none | `queries.ts:71` (used) | ACTION — delete across up to 3 tables |
| POST `/api/fulfillments/set_method` | requireAdmin | `fulfillments.fulfillments` UPDATE + conditional DELETE/INSERT on `pickups`/`directs`/`dropoffs`, `service.ts:359-385` | none | `queries.ts:59` (used) | ACTION — cascades across up to 4 tables |
| POST `/api/fulfillments/set_status` | requireAdmin | `fulfillments.fulfillments.status` UPDATE; **conditionally** `fulfillments.dropoffs` UPDATE when target is `IN_TRANSIT`/`DROPPED_OFF`, `service.ts:323-346` | `emails.sendPickupComplete` when category=PICKUP and new status is collected, controller.ts:55-64, after commit | `queries.ts:65` (used) | ACTION — gated by a computed transition table, conditional 2nd table, conditional email. **Central to the traced case, §4.** |
| POST `/api/fulfillments` | requireUser | INSERT `fulfillments.fulfillments` + matching detail row | none | `queries.ts:53` (used) | CREATE |
| PATCH `/api/fulfillments/:id` | requireUser | exactly one detail table per call (`shipping.shipments` / `fulfillments.pickups` / `fulfillments.dropoffs` / `fulfillments.directs`), never touches `fulfillments.fulfillments` itself, `service.ts:180-238` | none | `queries.ts:89` (used) | PATCH-OK — genuinely one row, one table, per call |

### logistics / shipping (14 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/shipping/validate_address` | requireUser | none | FedEx `validateAddress`, `handler.ts:8` | none found | PROVIDER — no write at all |
| POST `/api/shipping/get_locations` | requireUser | none | FedEx `getLocations`, `handler.ts:71` | none found | PROVIDER |
| POST `/api/shipping/check_pickup` | requireUser | none | FedEx `checkPickup`, `handler.ts:44` | none found | PROVIDER |
| POST `/api/shipping/get_tracking` | requireUser, requireOwnShipment | DELETE+bulk INSERT `shipping.tracking_scans`; UPDATE `shipping.shipments` (status/est_delivery/**delivered_at**), `operations/service.ts:113-125` | FedEx `getTracking`; `emails.sendShipmentSent`/`sendShipmentReceived` fired every call, `service.ts:78-79` | `shipping/queries.ts:46` (used) | ACTION — scan rows are a written consequence, not derived; email fires every call. **This is how `delivered_at` gets set today — see §4.** |
| POST `/api/shipping/cancel_label` | requireAdmin | `shipping.shipments.shipping_status='Cancelled'`, `service.ts:56-58` | real FedEx `cancelLabel`, precedes the write | `queries.ts:81` (used) | ACTION — irreversible carrier call |
| POST `/api/shipping/cancel_pickup` | requireAdmin | `shipping.pickups.status='canceled'`, `service.ts:260-271` | real FedEx `cancelPickup` | none found | ACTION (dead) |
| POST `/api/carriers/create` | requireAdmin | INSERT `organizations` + INSERT `shipping.carriers`, `service.ts:25-26` | none | none found | CREATE (dead) |
| POST `/api/carriers/update` | requireAdmin | UPDATE `shipping.carriers.logo` + UPDATE `organizations`, `service.ts:42-46` | none | none found | ACTION (dead) — 2 tables in one call; `logo` alone would patch cleanly, the org half belongs to organizations' own endpoint (which doesn't exist among these 115 routes) |
| DELETE `/api/carriers/delete` | requireAdmin | DELETE `shipping.carriers` + DELETE `organizations`, `service.ts:56-57` | none | none found | ACTION (delete, dead) |
| POST `/api/carrier_services/create` | requireAdmin | INSERT `shipping.services`, `repo.ts:55` | none | none found | CREATE (dead) |
| POST `/api/carrier_services/update` | requireAdmin | UPDATE `shipping.services`, one row, `buildUpdate`, `repo.ts:108-123` | none | none found | **FOLD** (dead) — clean single-table update |
| DELETE `/api/carrier_services/delete` | requireAdmin | DELETE `shipping.services`, one row, `repo.ts:125-127` | none | none found | ACTION (delete, dead) |
| PATCH `/api/shipments/:id` | requireAdmin | branch-dependent: multi-row UPDATE via `set_charge_for_order.sql`, OR `orders.transactions` UPDATE, OR single-row `shipping.shipments` UPDATE, OR `updateTracking` touching both `shipping.shipments` and `orders`, `patch.service.ts:25-46` | none | `queries.ts:69` (used) | **PATCH-FLAG** — 4 different single-field actions dispatched by which key is present; §3 |
| POST `/api/shipments/:id/label` | requireAdmin | claim UPDATE `shipping.shipments`; UPDATE `orders.transactions`; UPDATE `shipping.shipments` (tracking/cost); INSERT `shipping.pickups` (conditional), `labels.ts:203-252` | real, chargeable FedEx `createLabel` + optional `createPickup`, `labels.ts:119,126` | `queries.ts:75` (used) | ACTION/PROVIDER — buys a real label; 3 tables + a new row |

### orders (17 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/orders` | requireUser | INSERT `orders.orders`, `orders.lots`, `orders.transactions`, `orders.addresses`; UPDATE `orders.lots` premiums loop; UPDATE `fulfillments.*`, `place.ts:105-181` | FedEx label buy; `sendOrderPlacedConfirmation` | none found | CREATE |
| POST `/api/orders/admin` | requireAdmin | same as above + `checkout.*` writes, `place.ts:63-96` | same | none found | CREATE |
| POST `/api/orders/:id/documents/:kind/send` | requireAdmin | none (reads only) | real email, `delivery.ts:56` | `queries.ts:160` (used) | ACTION — irreversible send |
| POST `/api/orders/:id/documents/:kind` | requireAdmin | INSERT `media.pdfs`, `store.ts:79-83` | MinIO `putObject`, `store.ts:75` | `queries.ts:166` (used) | CREATE |
| POST `/api/orders/:id/review` | requireUser, requireOwnOrderParam | UPDATE `orders.orders.review_created`, **written directly in the controller**, `controller.ts:64` | none | none found | **FOLD** — see §2; also a standing convention violation (write belongs in service/rules, not the controller) independent of this audit |
| POST `/api/orders/:id/add_funds` | requireAdmin | UPDATE `auth.users` credit + INSERT `transactions` ledger, `service.ts:204-205` | `sendPayoutSent` after commit | wrapper exists, no UI caller | ACTION — ledger insert + email |
| POST `/api/orders/:id/finalize` | requireAdmin | UPDATE `orders.orders.spots_locked`; bulk UPDATE `orders.spots`; per-line UPDATE `orders.lots.price`; UPDATE `orders.transactions.total`, `service.ts:159-166` | none | `queries.ts:108` (used) | ACTION — 4 tables, multiple rows |
| POST `/api/orders/:id/cancel` | requireAdmin | UPDATE `orders.orders.spots_locked`; INSERT/UPDATE `shipping.shipments` return leg, `service.ts:251-263` | FedEx label purchase, `service.ts:267` | `queries.ts:116` (used) | ACTION — multi-table + irreversible label buy |
| POST `/api/orders/:id/reopen` | requireAdmin | UPDATE `orders.orders.status='Received'` only, `service.ts:178` | none | `queries.ts:112` (used) | **FOLD** — see §2; `status` is *already* in `OrderPatch` |
| POST `/api/orders/:id/supply` | requireAdmin | INSERT `refining.orders`; INSERT `refining.lots` ×N; UPDATE `refining.orders.sent_at`, `refining/service.ts:189-208` | none | wrapper exists, no UI caller | CREATE |
| POST `/api/orders/:id/refining-sale` | requireAdmin | INSERT `refining.orders` (or reuse) + INSERT `refining.lots` ×N, `service.ts:224-228` | none | `queries.ts:174` (used) | CREATE |
| PATCH `/api/orders/:id` | requireAdmin | UPDATE `orders.orders` only — `status`/`notes`/`assigned_to_id`, `repo.ts:66-85` | none | `queries.ts:102` (used) | PATCH-OK |
| PATCH `/api/orders/lots/:id` | requireAdmin | UPDATE `orders.lots` (money fields) **and** UPDATE `lots.items` (physical fields) in the same call; **conditionally** cascades a `retierPremiums` UPDATE across every other lot on the order, `service.ts:96-123` | none | `queries.ts:144` (used) | **PATCH-FLAG** — established exception, not a pure patch; central to the traced case, §4 |
| DELETE `/api/orders/lots/:id` | requireAdmin | DELETE `orders.lots` + DELETE `lots.items` + cascading `retierPremiums`, `service.ts:125-134` | none | `queries.ts:150` (used) | ACTION (delete, 2 tables + cascade) |
| POST `/api/orders/lots/:id/split` | requireAdmin | INSERT `lots.items` ×N + INSERT `orders.lots` ×N + cascading retier, `service.ts:140-152` | none | wrapper exists, no UI caller | CREATE — mints N new rows |
| POST `/api/orders/:id/lots` | requireAdmin | INSERT `lots.items` (or catalogue mint) + INSERT `orders.lots` link + cascading retier, `service.ts:71-86` | none | `queries.ts:138` (used) | CREATE |
| PUT `/api/orders/:id/spots` | requireAdmin | UPDATE `orders.orders.spots_locked`; bulk UPDATE `orders.spots` (all metals) + per-metal UPDATE loop, `spots/service.ts:20-30` | none | `queries.ts:132` (used) | ACTION — multi-row, multi-table |

### pricing / refining (16 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/rates` | requireAdmin | INSERT `rates.rates`, `repo.ts:26` | none | none found | CREATE (dead) |
| PATCH `/api/rates/:id` | requireAdmin | UPDATE `rates.rates`, `buildUpdate`, `repo.ts:35` | none | none found | PATCH-OK (dead) |
| DELETE `/api/rates/:id` | requireAdmin | DELETE `rates.rates`, `repo.ts:47` | none | none found | ACTION (delete, dead) |
| POST `/api/quotes/catalog` | none | none — `db/pricing` has zero write statements | none | none found | COMPUTE (dead) |
| POST `/api/quotes/order` | requireUser, requireOwnOrder | none | none | none found | COMPUTE (dead) |
| POST `/api/quotes/profit_breakdown` | requireAdmin | none | none | `orders/queries.ts:84` (used) | COMPUTE |
| POST `/api/refining/pool/locks` | requireAdmin | INSERT `refining.pool` (new `'lock'` ledger row), `pool/repo.ts:26` | none | none found | CREATE (dead) — ledger insert would fail criterion 3 even if it weren't a create |
| PATCH `/api/refining/lots/:id` | requireAdmin | UPDATE `refining.lots` only, `repo.ts:47` | none | `refining/queries.ts:135` (used) | PATCH-OK |
| DELETE `/api/refining/lots/:id` | requireAdmin | DELETE `refining.lots`, `repo.ts:93` | none | `queries.ts:141` (used) | ACTION (delete) |
| POST `/api/refining/orders` | requireAdmin | INSERT `refining.orders` (sequence-numbered) + INSERT `refining.lots` if `lot_ids` given, `orders/repo.ts:33` | none | `queries.ts:105` (used) | CREATE |
| PATCH `/api/refining/orders/:id` | requireAdmin | UPDATE `refining.orders` only, `repo.ts:67` | none | `queries.ts:111` (used) | PATCH-OK — `sent_at`/`settled_at`/`cancelled_at` deliberately excluded, see next row |
| POST `/api/refining/orders/:id/send` | requireAdmin | UPDATE `refining.orders.sent_at` only, idempotent via `COALESCE`, `orders/repo.ts:84` | **none in current code** (a code comment anticipates a notification that doesn't exist yet) | `queries.ts:117` (used) | **AMBIGUOUS** — see §5, technically satisfies all 4 criteria as coded today |
| POST `/api/refining/orders/:id/cancel` | requireAdmin | UPDATE `refining.orders.cancelled_at` + DELETE all `refining.lots` for the order, `orders/repo.ts:103` | none | `queries.ts:147` (used) | ACTION — deletes a second table's rows |
| POST `/api/refining/orders/:id/documents/:kind` | requireAdmin | INSERT `media.pdfs`, `delivery.ts:72` | MinIO write, `store.ts:75` | `queries.ts:153` (used) | CREATE |
| POST `/api/refining/orders/:id/settle` | requireAdmin | bulk UPDATE `refining.lots`; UPDATE `refining.orders`; INSERT `refining.pool` credit row(s) per metal, `lots/repo.ts:64`, `pool/repo.ts:35` | none external, but ledger insert is itself an irreversible-class write | `queries.ts:123` (used) | ACTION — 3 tables + ledger insert |
| POST `/api/refining/orders/:id/lots` | requireAdmin | INSERT `refining.lots` ×N, `lots/repo.ts:33` | none | `queries.ts:129` (used) | CREATE |

### transactions (19 routes)

| Method · Path | Guard | Writes | Side effects | Caller | Class · reason |
|---|---|---|---|---|---|
| POST `/api/payments/banks/link_token` | requireUser | none | Plaid `createLinkToken` | none found | PROVIDER — no write |
| POST `/api/payments/banks/vaulted` | requireAdmin | INSERT `payments.bank_links`, `sql/create.sql:1` | none | none found | CREATE |
| POST `/api/payments/banks/link` | requireUser | INSERT `payments.bank_links` | Plaid exchange + Moov link — real, precede the write | none found | CREATE/PROVIDER |
| POST `/api/payments/banks/micro_deposits` | requireUser | INSERT `payments.bank_links` | Moov `linkByNumbers`+`startMicroDeposits` — kicks off a real ACH deposit | none found | CREATE/PROVIDER |
| POST `/api/payments/banks/:id/verify` | requireUser | UPDATE `payments.bank_links` (`status`,`bank_name`,`payment_method_id`), one row, `repo.ts:52` | Moov `confirmMicroDeposits` — irreversible, max-2-attempts | none found | ACTION — write is one row, but exists only to record a non-idempotent provider verification |
| POST `/api/payments/charges` | requireAdmin | INSERT/upsert `payments.transfers`, `transfers/sql/create.sql:1` | none | `payments/queries.ts:103` (used) | CREATE |
| POST `/api/payments/charges/:id/request` | requireAdmin | UPDATE `payments.transfers` ×2 (`state`, then `provider_ref`), `repo.ts:101` | Moov `createTransfer` — real ACH pull, wrapped in `attempt(...)` | `queries.ts:109` (used) | ACTION — real money movement, not derivable from a re-read |
| POST `/api/payments/charges/:id/fail` | requireAdmin | UPDATE `payments.transfers` (`state`,`failure_reason`,`completed_at`), one row, `repo.ts:101` | none | none found | **FOLD** — see §2 |
| PATCH `/api/payments/details/:id` | requireAdmin | UPDATE `payments.details.method_id` **and** UPDATE `orders.transactions` (`payout_fee`/`waive_payout_fee`), `service.ts:110,118` | none; never touches sealed bank-number columns | none found | **PATCH-FLAG** — 2 tables in one call; §3 |
| POST `/api/payments/inbound/wire` | requireAdmin | INSERT/upsert `payments.inbound_transactions`, `sql/create.sql:1` | none | `queries.ts:117` (used) | CREATE |
| POST `/api/payments/inbound/sync` | requireAdmin | INSERT ×N `payments.inbound_transactions` (loop) + UPSERT `payments.feed_cursors`, `service.ts:126-150` | Plaid `syncTransactions` feed pull | none found | ACTION — plural rows, 2 tables, driven by an external feed |
| POST `/api/payments/inbound/:id/match` | requireAdmin | UPDATE `payments.inbound_transactions` + UPDATE `payments.transfers` (`state→Received`), `service.ts:68` | none | `queries.ts:123` (used) | ACTION — 2 tables, 2 rows |
| POST `/api/payments/inbound/:id/unmatch` | requireAdmin | UPDATE `payments.inbound_transactions` + UPDATE `payments.transfers` (`state→Due`), `service.ts:91-96` | none | none found | ACTION — mirror of match |
| POST `/api/payments/payouts` | requireAdmin | INSERT/upsert `payments.transfers`, `sql/create.sql:1` | none | `queries.ts:75` (used) | CREATE |
| POST `/api/payments/payouts/:id/send` | requireAdmin | UPDATE `payments.transfers` ×2 (`state→Processing`, then `provider_ref`), `repo.ts:101` | Moov `createTransfer` — real transfer, wrapped in `attempt(...)` | `queries.ts:81` (used) | ACTION — money leaves here, not derivable |
| POST `/api/payments/payouts/:id/mark_sent` | requireAdmin | UPDATE `payments.transfers` (`provider`,`provider_ref`,`reference`) then (`state→Sent`), one row/table total, `repo.ts:101` | none — this is the manual rail, no provider call | `queries.ts:87` (used) | **FOLD** — see §2 |
| POST `/api/payments/payouts/:id/fail` | requireAdmin | UPDATE `payments.transfers` (`state`,`failure_reason`,`completed_at`), one row, `repo.ts:101` | none | `queries.ts:95` (used) | **FOLD** — see §2 |
| POST `/api/stripe/update_payment_intent` | requireUser | UPDATE/INSERT `payments.intents`; UPDATE/INSERT `payments.attempts`; INSERT `payments.settlements` conditionally, `service.ts:104-166` | real Stripe `retrieveIntent`/`updateIntent`/`createIntent` | none found | ACTION — real Stripe mutation + up to 3 tables |
| POST `/api/stripe/cancel_payment_intent` | requireAdmin | UPDATE `payments.intents`+`payments.attempts`, conditional INSERT `payments.settlements`, `service.ts:136` | real Stripe `cancelIntent` | none found | ACTION — same multi-table fan-out |

### app.ts direct routes — outside any domain router (8 routes)

All eight are signature/HMAC-verified provider callbacks; none is a candidate for anything
but staying exactly what it is (a client can't send these — the provider does).

| Method · Path | Guard | Verification | Class |
|---|---|---|---|
| POST `/api/auth/stripe/webhook` | Stripe signature | `stripe.verifyWebhook`, `transactions/controller.ts:31` | PROVIDER |
| POST `/api/webhooks/moov` | Moov HMAC headers | `moov.verify`, `rails/controller.ts:20-27` | PROVIDER |
| POST `/api/webhooks/plaid` | Plaid JWT header | `plaid.verify`, `rails/controller.ts:41` | PROVIDER |
| POST `/api/webhooks/resend` | Resend HMAC headers | `email.verifyWebhook`, `emails/controller.ts:35` | PROVIDER |
| POST `/api/sms/inbound` | Twilio signature | `verified(req, …)`, `sms/controller.ts:24` | PROVIDER |
| POST `/api/sms/status` | Twilio signature | `verified(req, …)`, `sms/controller.ts:31` | PROVIDER |
| POST `/api/calls/twiml` | Twilio signature | `verified(req, …)`, `calls/controller.ts:32` | PROVIDER |
| POST `/api/calls/status` | Twilio signature | `verified(req, …)`, `calls/controller.ts:38` | PROVIDER |

## 1. Counts per class

**Post-fold (2026-09-12): see `docs/waves/write-fold.md`.** The fold list (§2) and the
`/shipments/:id` reverse finding (§3) have both been executed; the counts below are the
ones this census produced *before* that wave and are kept for the record. The current
tally is **121** non-GET routes: FOLD is 0 (all 8 resolved), PATCH-FLAG is 3 (`/shipments/:id`
is fixed), PATCH-OK is 13 (+1 for `/shipments/:id`, +3 new: `/carrier_services/:id`,
`/payments/charges/:id`, `/payments/payouts/:id`), ACTION is 52 (+3 new:
`/shipments/:id/charge`, `/shipments/:id/actual_cost`, `/shipments/:id/tracking`), and
CREATE/PROVIDER/COMPUTE/AMBIGUOUS are unchanged. `fulfillments/methods/update` and
`fulfillments/schedule_dropoff` were deleted outright with no replacement route (dead code
in the first case, a duplicate of the existing fulfillments PATCH in the second), so the
total dropped by 2 net rather than staying flat.

| Class | Count (2026-09-11) | Count (post-fold) | Notes |
|---|---|---|---|
| ACTION | 49 | 52 | Disqualified by a 2nd table, an irreversible side effect, or non-idempotent arithmetic — the specific disqualifier is cited per-route above. Includes both existing PUT routes (`/checkout/lots`, `/orders/:id/spots`) — neither is single-row/single-table either. +3 post-fold: the three actions split out of `/shipments/:id` |
| CREATE | 36 | 36 | POST that inserts a new row (or rows); stays regardless of frontend-nuke/dead-code status |
| PATCH-OK | 9 | 13 | Existing PATCH routes confirmed genuinely single-row/single-table/no-side-effect: `/products/:id`, `/leads/:id`, `/reviews/:id`, `/checkout`, `/fulfillments/:id`, `/orders/:id`, `/rates/:id`, `/refining/lots/:id`, `/refining/orders/:id`. Post-fold adds `/shipments/:id` (reverse finding fixed), `/carrier_services/:id`, `/payments/charges/:id`, `/payments/payouts/:id` |
| PROVIDER | 13 | 13 | `/calls/token`, `/payments/banks/link_token`, the 3 read-only FedEx passthroughs (`validate_address`/`get_locations`/`check_pickup`), + 8 app.ts webhooks |
| FOLD (patch candidates, currently POST) | 8 | 0 | §2 — all 8 resolved, see `write-fold.md` |
| PATCH-FLAG (reverse findings) | 4 | 3 | `/addresses/:id`, `/orders/lots/:id`, `/payments/details/:id` — §3. `/shipments/:id` is fixed, no longer flagged |
| COMPUTE (POST-with-body, zero write) | 3 | 3 | `/quotes/catalog`, `/quotes/order`, `/quotes/profit_breakdown` — not a patch question, nothing to fold |
| AMBIGUOUS | 1 | 1 | `/refining/orders/:id/send` — §5 |
| **Total** | **123** | **121** | 52+36+13+13+0+3+3+1 |

The 13 PATCH-verb routes on 2026-09-11 split 9 clean / 4 flagged; both PUT-verb routes are
counted under ACTION for the same multi-row/multi-table reasons cited in their rows above
— neither satisfies the criterion either, and neither is a fold candidate (a PUT that
replaces a whole set is a different operation than a field patch).

**Dead-code signal (no client caller found anywhere, strongest reading):** roughly a third
of the 123 routes — every route in checkout, documents/emails, documents/pdfs, catalog,
crm/calls, all of crm/leads and crm/reviews, pricing/rates, `quotes/catalog`,
`quotes/order`, `refining/pool/locks`, all five `transactions/banks` routes, `charges/fail`,
`payments/details` PATCH, `inbound/sync`, `inbound/unmatch`, both stripe routes, and most
of shipping's admin CRUD (carriers, carrier_services, `cancel_pickup`, `validate_address`,
`get_locations`, `check_pickup`). **This is a candidate list, not a deletion list** — say
so to whoever acts on it next; a route with no caller found is unproven, not condemned.

## 2. The fold list — routes that become PATCHes

Grouped by resource. Each either targets an **existing** PATCH route (just add the column)
or needs a **new** PATCH route for a resource that doesn't have one yet.

| Resource | Route(s) folding in | Target PATCH | Columns to add |
|---|---|---|---|
| **orders.orders** | `POST /orders/:id/reopen` | existing `PATCH /orders/:id` | none — `status` is already in `OrderPatch`; the route today only adds a from-Cancelled guard that belongs in `rules.ts` regardless of transport |
| **orders.orders** | `POST /orders/:id/review` | existing `PATCH /orders/:id` | `review_created` (not currently in `OrderPatch`) — also move the write out of the controller into `service.ts`/`rules.ts`, an existing convention violation independent of this fold |
| **fulfillments.dropoffs** | `POST /fulfillments/schedule_dropoff` | existing `PATCH /fulfillments/:id` (`dropoff` branch) | none — `FulfillmentDropoffChoices` already covers `refiner_id`/`location_id`/`driver_employee_id`/`start_time`/`end_time`; this POST route appears to duplicate the PATCH's dropoff branch entirely |
| **fulfillments.methods** | `POST /fulfillments/methods/update` | new `PATCH /fulfillments/methods/:id` | whatever `updateMethod` sets today (label/enabled/hidden-style fields) — currently dead, so folding costs nothing live |
| **shipping.services** | `POST /carrier_services/update` | new `PATCH /carrier_services/:id` | all of `updateService`'s fields — already uses `buildUpdate` internally, currently dead |
| **payments.transfers (charges)** | `POST /payments/charges/:id/fail` | new `PATCH /payments/charges/:id` | `state`, `failure_reason`, `completed_at` — rank-guarded by `movesForward()`, a derived check |
| **payments.transfers (payouts)** | `POST /payments/payouts/:id/mark_sent` | new `PATCH /payments/payouts/:id` | `provider`, `provider_ref`, `reference`, `state` (manual rail only — no provider call on this path) |
| **payments.transfers (payouts)** | `POST /payments/payouts/:id/fail` | same new `PATCH /payments/payouts/:id` | `state`, `failure_reason`, `completed_at` |

Two of the eight (`schedule_pickup`, `schedule_direct`) were checked and are **not** on this
list even though their table write is single-row/single-table: both fire a real
after-commit email (`sendPickupBooked`/`sendAppointmentBooked`). The write itself is
patch-shaped; the endpoint as a whole isn't, because the email is bundled into the same
call. If the write and the notification were split — patch the schedule, then a separate
explicit "send confirmation" action — the write half would fold too. That's a design
call, not made here.

## 3. Reverse findings — existing PATCH/PUT doing action work

| Route | What it actually does | Why it fails the criterion |
|---|---|---|
| `PATCH /api/addresses/:id` | Updates `places.addresses` and `places.user_addresses`, and can cascade into a 2-statement default-flip across sibling rows | 2 tables, and conditionally 2 rows |
| `PATCH /api/shipments/:id` | Dispatches on which key is present in the body to one of 4 different single-field actions — a multi-row `set_charge_for_order.sql`, an `orders.transactions` update, a single-row `shipments` update, or `updateTracking` (which itself touches both `shipping.shipments` and `orders`) | Not one shape at all; up to 2 tables and multiple rows depending on branch. Flagged explicitly: **do not use this as a template** for any future single-table patch |
| `PATCH /api/orders/lots/:id` | Splits its own patch body into "money" fields (→ `orders.lots`) and "facts" fields (→ `lots.items`), writing both tables in one call when both are present; when a facts field changes, **also** cascades a `retierPremiums` UPDATE across every other lot on the order | 2 tables per call, and a computed reprice that is *written* to sibling rows rather than left to a later read — this is the endpoint the traced case in §4 depends on |
| `PATCH /api/payments/details/:id` | Updates `payments.details.method_id` and `orders.transactions` (`payout_fee`/`waive_payout_fee`) in the same call | 2 tables. (Confirmed clean on the one thing that matters most: it never touches the sealed bank-number columns.) |

All four are documented, deliberate shapes in the code (comments cite the reasoning at
`orders/service.ts:94-95` for the lots case) — not oversights. They're flagged because the
brief asked for the reverse check, not because they need fixing.

## 4. The two traced cases

### a) Marking an inbound fulfillment received

**Today, "received" doesn't exist as its own concept.** There is no `received_at` column
anywhere in `fulfillments.*`. Two different things already play that role depending on
category:

- **PICKUP / DIRECT / DROPOFF** (local ops, no carrier): the closest thing to "received" is
  the fulfillment's `status` reaching a terminal value — `PICKED_UP` (pickup),
  `COMPLETED` (direct), or `DROPPED_OFF` (dropoff), collectively `isCollected()`
  (`fulfillments/rules.ts:14-20`). That transition is set today only through
  `POST /fulfillments/set_status` → `moveStatus` → `setStatus`
  (`fulfillments/service.ts:309-346`).
- **SHIPMENT** (carrier-shipped): `shipping.shipments.delivered_at` already exists and is
  set by the tracking sync, `POST /shipping/get_tracking` →
  `operations/service.ts:113-125`, when FedEx reports the parcel delivered.

**Tracing what a bare `received_at` PATCH would need:**

1. **The gate** ("only after delivered/picked-up/completed") is exactly `isCollected(status)`
   today for local ops, or `delivered_at IS NOT NULL` for shipments — both are *reads*, so
   a gate is expressible in `rules.ts` without writing anything else. That part is fine.
2. **The consequences that already exist on the current path are not purely derived —
   some are written.** `set_status`, the current stand-in for "mark received," does two
   things a plain `received_at` PATCH would silently drop:
   - For `IN_TRANSIT`/`DROPPED_OFF` transitions, it **also** updates
     `fulfillments.dropoffs.departed_at`/`dropped_off_at` — a second table, conditionally
     written (`service.ts:330-344`).
   - For PICKUP transitions into `PICKED_UP`, the **controller** (not the service) fires
     `emails.sendPickupComplete(order_id)` after commit
     (`fulfillments/controller.ts:55-64`) — a real, irreversible send, gated on category
     and the collected check, with its own dedupe (`sentAlready('pickup_complete', …)`).
3. **No payout or lot-position cascade was found.** Grepping `set_status`/`moveStatus`
   and the whole fulfillments `rules.ts`/`service.ts` for `orders.lots` or any payout
   table turned up nothing — this domain never reads or writes either. The "payout gate"
   the brief anticipated isn't wired to fulfillment status at all today; whatever gates a
   payout (see §4b) doesn't currently look at `fulfillments.fulfillments`.

**Conclusion: a new `received_at` column, patched in isolation, is not a safe drop-in
replacement for `set_status` as it exists — it would bypass the transition gate
(`assertTransition`) and the pickup-complete email, both of which are real, load-bearing
behavior today, not incidental transport shape.** It *could* become a clean PATCH if:
(a) the column is written only after `rules.ts` confirms the same gate `assertTransition`
already checks (a read, fine), and (b) the email and the dropoff-timestamp write are
either accepted as no longer firing on this new path (a product decision, not an
engineering one) or are re-triggered some other way (e.g., derived from `received_at`
becoming non-null, checked by a follow-up read rather than written inline). As specified
in the brief — "just a patch to the fulfillment" — it is not yet safe; the email and the
conditional dropoff write are the two disqualifiers to resolve first.

### b) Recording a lot's in-house weight and purity

**Correction to the premise: these are not proposed new columns, and they don't belong on
`orders.lots`.** `orders.lots` (`id, order_id, lot_id, premium, price, sales_tax_charged,
confirmed, …`) is purely the order-and-money join row — genesis
`api/migrations/000_genesis_schema.sql:1066-1089`, current shape
`packages/contracts/src/orders/lots.ts:8-20`. Weight and purity live one level down, on
`lots.items` (`id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
content_snapshot, content [generated]`, genesis `:874-892`,
`packages/contracts/src/lots/items.ts:8-26`), and **they already exist and are already
writable**: `pre_melt` is the customer-declared weight, `post_melt` is exactly "the
in-house/verified weight after processing" (comment at `orders/rules.ts:75-78`, PDF label
`'post melt'`, and the `post_melt ?? pre_melt` coalesce used everywhere weight is priced
or shipped), and `purity` is a single field the customer's declaration and Dorado's
in-house correction both write — there's no separate declared-vs-verified purity split.

Both already flow through the existing `PATCH /api/orders/lots/:id` today, via
`rules.lotFacts` (`orders/rules.ts:62-65`) into `lots.items` update
(`db/lots/items/repo.ts:85-100`).

**So by the letter of the brief, this is already done — with one honest caveat.** As
detailed in §3, that same PATCH is not a pure single-row/single-table patch: setting
`post_melt`/`purity` (or `pre_melt`/`unit`/`quantity`) triggers `rules.retiersAfterEdit`
(`orders/rules.ts:96-105`) and, through it, `retierPremiums`
(`orders/service.ts:49-59`), which re-prices **every lot on the order** and writes a new
`premium` to each one's `orders.lots` row. That write is deliberate and documented
(`orders/service.ts:94-95`), not a bug — but it means "patch a lot's weight and purity"
today actually means "update 1 row of `lots.items`, plus N rows of `orders.lots`," which
fails criteria (1) and (2) as written. It's an accepted exception, not a clean pass.

**Position/status found and confirmed derived, not written:** the lot's display position
("Lot 2481-A") is a `row_number() OVER (...)` computed at read time
(`db/orders/lots/sql/view_for.sql:1-31`) — a real example of the "derived by later reads"
half of the criterion working as intended. The one lot-level status field,
`orders.lots.confirmed`, is read (never derived-and-written) by
`rules.allLotsConfirmed`/`finalizeBlockedBy` to gate `finalize`
(`orders/rules.ts:170-188`), and the payout/refiner-sale path depends on it only
indirectly, through that finalize gate — `transactions/**` never reads `orders.lots` or
`lots.items` directly (grep-confirmed, no hits).

**Conclusion: no new columns needed; the concept already exists and is already
PATCH-shaped in intent.** The only real finding is the one in §3 — the existing patch
route isn't as clean as it looks once weight/purity are the fields being set, because of
the premium-retier cascade. Recommend treating `PATCH /api/orders/lots/:id` as a known,
accepted exception (as the code already documents it) rather than a template for judging
other routes' cleanliness.

## 5. Ambiguous cases

**`POST /api/refining/orders/:id/send`** (`refining/routes.ts:40`) — as coded today, this
technically satisfies all four criteria: it writes exactly `refining.orders.sent_at`
(one column, one row, one table), the write is idempotent (`COALESCE`, a second call is a
no-op), and there is **no live side effect** — a code comment at `send.sql:1-2` anticipates
an email that was never implemented. The reasons it's kept separate from
`PATCH /api/refining/orders/:id` (which deliberately excludes `sent_at`,
`RefiningOrderPatch`, `contracts/src/refining/orders.ts:43`) are: (a) it's gated by
`assertSendable` (`refining/rules.ts:110`), a cross-table precondition (lots must exist on
the order) that a generic field-PATCH would need to special-case rather than just accept
whatever value is sent, and (b) the column marks a real-world event ("sent to the
refiner") that the codebase's own comment expects to eventually carry a notification.
**Recommendation: leave it as an action for now** — the moment that notification gets
built, the side effect makes the classification unambiguous; folding it into the generic
PATCH today would remove the one gate (`assertSendable`) standing between "send" and "an
order with no lots gets marked sent."

No other route was ambiguous by the criterion — everything else was either a clean pass,
or had a specific, nameable disqualifier (a second table, a real provider call, or
non-idempotent arithmetic) cited in the table above.
