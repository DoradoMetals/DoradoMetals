# logistics and documents review

Area: `api/src/domains/logistics/**`, `api/src/domains/documents/**`,
`api/src/domains/catalog/**`, `api/src/domains/crm/**`,
`api/src/providers/{shipments,emails,pdfs,s3,places,captcha}/**`, the SQL under
`api/src/db/{fulfillments,shipping,products,leads,reviews}/**`, and the matching
contracts.

Reproduction environments: the per-branch local test database `test_review_lane`
(via `pnpm --filter @dorado/api test`) and the read-only rebuilt production copy
`chain6` on 127.0.0.1:5544. Three findings were reproduced by throwaway test
files, which were deleted afterwards; the tree is unchanged.

## Findings (most severe first)

### F1 Any logged-in customer can download any other customer's invoice, packing list and return packing list [severity: authz]

- where: `api/src/domains/documents/pdfs/serve.ts:39-75` (the fall-through at
  line 74); `api/src/domains/documents/pdfs/routes.ts:14-17`
- proof: `serveOrderDocument` computes `entitled` (admin, or
  `orderOwnedBy(orderId, caller.id)`) at lines 46-49 and uses it only to decide
  whether to read/persist the CACHED copy. When it is false, line 74 is

  ```ts
  return { bytes: await render(), source: 'rendered' }
  ```

  which renders the document and returns it. The four routes carry only
  `requireUser`; the controller passes `caller: req.user` straight through and
  `order-inputs.ts` does no ownership check of its own. The existing test
  `pdfs/tests/serve.test.ts:201-223` ("a caller who does not own the order never
  touches the store and persists nothing") asserts exactly this: `r.calls.length
  === 1` and `source === 'rendered'` for a stranger. It pins the leak.

  Reproduced over HTTP as `TEST_CUSTOMER` against a purchase order owned by a
  different `user_id`:

  ```
  /api/pdf/generate_invoice             -> 200 application/pdf  81495b
  /api/pdf/generate_packing_list        -> 200 application/pdf 147710b
  /api/pdf/generate_return_packing_list -> 200 application/pdf  74853b
  ```

  The invoice carries the owner's name, line weights, purities and payout total;
  the packing list additionally embeds their real FedEx label image and their
  street address. Order ids are exposed to their owner and appear in URLs, so
  this needs no guessing by the target's counterpart.
- contrast: the sibling email surface DOES check. `documents/emails/controller.ts:21-33`
  `recipientFor` throws `Forbidden` for a non-owning non-admin. Only the PDF
  routes are open.
- fix: `entitled` must gate the whole function - throw `NotFound` (not
  `Forbidden`, so the answer cannot confirm somebody else's order exists) when it
  is false - or put `requireOwnOrder` on all four routes in
  `documents/pdfs/routes.ts`. Both, ideally.

### F2 A customer can set their parcel's shipper/recipient address to any address row in the database [severity: authz]

- where: `logistics/fulfillments/service.ts:140-144` (`patchChoices`, the
  `shipment` branch) -> `logistics/shipping/parcel.ts:21-27` `applyChoices` ->
  `db/shipping/shipments/repo.ts:93` `update`. Same shape for
  `pickup_address_id` at `service.ts:148`. Contract:
  `packages/contracts/src/fulfillments/fulfillments.ts:57-67`
  `FulfillmentShipmentChoices`.
- proof: `requireFulfillmentOwner` proves the FULFILLMENT is the caller's; nothing
  proves the ADDRESS is. `shipping.shipments.shipper_address_id` has FK
  `shipments_shipper_address_fk -> places.addresses(id)` (chain6 `\d
  shipping.shipments`) - an id check, not an owner check. Same for
  `fulfillment_pickups_pickup_address_id_fkey -> places.addresses(id)`.

  Reproduced over HTTP as `TEST_CUSTOMER`: `GET /api/checkout` (200) ->
  `POST /api/fulfillments {checkout_id}` (200, method `CARRIER DROPOFF`) ->

  ```
  PATCH /api/fulfillments/<id> {"shipment":{"shipper_address_id":"8dc9578e-…"}}
  -> 200, parcel.shipper_address_id = 8dc9578e-…  (owner 66a64017-…, not the caller)
  ```

  This is a REGRESSION introduced by migration 128. Migration 123 had replaced
  `checkouts_shipper_address_fk` and `checkouts_pickup_address_fk` with composite
  keys `(user_id, <address column>) -> places.user_addresses` precisely to say
  "this address is in THIS ROW'S OWNER'S book" (`123_*.sql:100-130`).
  `docs/waves/boundary-feature.md` records 128 moving those columns onto
  `shipping.shipments` / `fulfillments.pickups` and notes "the other two went
  with their columns" - the guard was dropped and nothing replaced it.
  `checkout.recipient_address_id` kept its guard and is still rejected
  (`checkout/tests/checkout-row.test.ts:148-160`).
- downstream: `orders/place.ts:135-141` `snapshotAddress` reads
  `fulfillmentService.addressIdOf` and COPIES the row into the order's address
  snapshot, which `orders/read.ts` then returns to the caller - so the attacker
  reads back line_1/city/zip/phone. `labels.ts:97,111` prints it on the FedEx
  label as the shipper.
- fix: `patchChoices` must verify the address is in the caller's
  `places.user_addresses` before writing it (the check `checkout/service.ts`
  already performs), and 128's dropped composite FKs should be re-added against
  the new columns.

### F3 A cancel or a supplier send links a second shipment to the same fulfillment, and every "the fulfillment's parcel" read then picks one at random [severity: data]

- where: `orders/service.ts:194` (`shipmentService.create(order_id, 'Return')`)
  and `:240` (`'Outbound'`) -> `logistics/shipping/shipments/service.ts:50-70` ->
  `logistics/fulfillments/service.ts:228-236` `chooseDefault` ->
  `db/fulfillments/sql/create.sql` (`ON CONFLICT (order_id) DO NOTHING`) ->
  `fulfillmentShipments.link` -> `db/fulfillments/shipments/sql/upsert.sql`.
  The two readers that then have to choose:
  `db/fulfillments/sql/view.sql:46-50` (`ORDER BY fs.id ASC LIMIT 1`) and
  `db/fulfillments/shipments/sql/get_for.sql` (`ORDER BY id ASC`), where
  `fulfillments.shipments.id` is `gen_random_uuid()`.
- proof: `chooseDefault` cannot mint a second fulfillment - the order already has
  one and `ON CONFLICT DO NOTHING` returns nothing, so `viewOne(null, order_id)`
  hands back the EXISTING fulfillment, and `link` upserts a second row into
  `fulfillments.shipments` for it. Reproduced against `test_review_lane`: an
  order with one Inbound shipment, then `orders.cancel(...)`:

  ```
  links=2  ORDER BY fs.id -> Return,Inbound
  FulfillmentView.parcel.direction = Return
  shipmentsService.getByOrder(...).direction = Return
  ```

  The ordering is over random uuids, so which leg wins is a coin flip per order.
- impact: `orders/service.ts:249-259` `updateTracking` writes the hand-entered
  sales tracking number onto `shipmentService.getByOrder(order_id)` - i.e. onto
  whichever leg won. `fulfillmentService.addressIdOf`, `missing`, `actions` and
  `shipmentIdOf` all describe the wrong leg roughly half the time. A sale that
  goes to a refiner hits the same thing (the DROPSHIP draft's shell plus the
  Outbound one `sendToRefiner` mints).
- not visible in the production copy: chain6 holds no `Return` shipments at all
  (62 Inbound, 9 Outbound), so no existing row has two links yet.
- fix: a fulfillment's parcel must be selected by DIRECTION and creation order,
  not by link id - or, better, a return/outbound leg should get its own
  fulfillment rather than being upserted onto the inbound one.

### F4 An admin cannot cancel a purchase order the customer brought in by pickup or appointment [severity: rule]

- where: `orders/service.ts:165-213` `cancel` -> `shipping/shipments/service.ts:60-66`
  -> `logistics/fulfillments/shipments/service.ts:12` `assertCategory(fulfillment_id, 'SHIPMENT')`
- proof: `cancel` only asserts direction and `assertReturnable` (an address
  snapshot exists - `orders/rules.ts:226-232`). It then calls
  `shipmentService.create(order_id, 'Return')`, which resolves the order's
  EXISTING fulfillment (F3) and calls `link`, which asserts the category is
  SHIPMENT. Reproduced against `test_review_lane` with a purchase order whose
  fulfillment method is `PICKUP`:

  ```
  PICKUP cancel -> "fulfillment 30061a77-… is a PICKUP, not a SHIPMENT -
                    change the method before scheduling"
  ```

  Both `PICKUP` and `APPOINTMENT` are enabled, unhidden, default methods for
  `purchase` in chain6's `fulfillments.methods`, so this is the live path for any
  order the customer handed over in person. The error text is also wrong for the
  situation - nothing is being scheduled.
- fix: a return leg does not need the customer's inbound fulfillment to be a
  SHIPMENT. Give the return its own fulfillment (see F3), or drop the category
  assertion from the return path.

### F5 A label can be bought twice, and a label bought is a label that may never be recorded [severity: data]

- where: `logistics/shipping/labels.ts:74-141` `buyLabel`, `:143-185`
  `buyReturnLabel`, `:187-226` `record`; `orders/place.ts:182`
- proof, three separate gaps:
  1. `buyLabel` reads the shipment at line 75 on the pool and asserts
     `assertUnlabelled` at line 77. There is no `FOR UPDATE`, no transaction, and
     no unique constraint on `shipping.shipments.tracking_number` (chain6 `\d`
     shows a plain `shipments_tracking_idx`). Two concurrent
     `POST /api/shipments/:id/label` calls both pass the check and both buy.
  2. The carrier call at line 111 happens BEFORE `record()` at line 131. If
     `record`'s transaction fails, the label is bought and paid for, the shipment
     still has `tracking_number = NULL`, and the next retry passes
     `assertUnlabelled` and buys a second one. `voidLabel` is only reached when
     the carrier returns no label FILE (`operations/service.ts:245-252`), never
     when the write fails.
  3. `buyReturnLabel` has NO `assertUnlabelled` at all (compare line 77 with
     lines 144-146). Calling `orders.cancel` twice after a successful first
     cancel buys a second return label and overwrites `tracking_number` and
     `label`, orphaning the first. `orders/tests/cancel.test.ts:81-106` covers
     the retry-after-FAILURE case only.
  4. `place.ts:182` is a bare `await world.buyLabel(placed.shipment_id)` after
     the commit. A FedEx outage there throws out of `place()`: the order is
     already committed, the basket is not cleared (line 184), no confirmation is
     sent (line 187), and the customer sees a failure on an order that exists -
     the shape that produces duplicate orders. Contrast line 184, which is
     wrapped in `attempt`.
- fix: take the shipment `FOR UPDATE` inside a transaction that ends before the
  carrier call; make `record` retry-safe or void the label when it fails; add
  `assertUnlabelled` to `buyReturnLabel`; wrap the post-commit
  `buyLabel` so a carrier failure leaves the order placed and reports itself
  rather than failing the request.

### F6 The shipping charge deducted from the payout is re-quoted with a pickup type the checkout quote never sent [severity: money]

- where: `logistics/shipping/operations/service.ts:151-166` (checkout rates) vs
  `logistics/shipping/labels.ts:100-110` (the charge that is recorded)
- proof: `getFulfillmentRates` calls `quoteRate(..., pickupType = undefined, ...)`
  - the fifth argument is literally `undefined` at line 164 - so
  `payloads.rateQuotePayload` omits `requestedShipment.pickupType`. `buyLabel`
  quotes the same parcel with `requests.rateParcel(parcel).pickupType`, which is
  `parcel.handoff.code`: `DROPOFF_AT_FEDEX_LOCATION` or
  `CONTACT_FEDEX_TO_SCHEDULE` (`providers/shipments/adapters/fedex.catalogue.ts:11-26`).
  FedEx rates differ between those. The result of the second quote is written
  straight to `shipping.shipments.cost` (`labels.ts:204-213`), and
  `db/pricing/sql/order_pricing.sql:99-107,154-158` subtracts exactly that
  `sh.cost` from the customer's payout. Nothing compares it with the number the
  customer was shown, and nothing caps it.
- fix: quote both sides with the same `pickupType`, and either freeze the quoted
  charge at placement or refuse a buy-time quote that exceeds the shown one.

### F7 A sale can be placed with no delivery service, and its shipping charge is then zero [severity: money]

- where: `logistics/fulfillments/rules.ts:61-71` `missingFor`;
  `db/pricing/sql/sale_quote.sql:11-19` (`carriage`) and `:90-92`
- proof: for a SHIPMENT fulfillment the first statement is

  ```ts
  if (parcel && parcel.direction !== 'Inbound') return missing
  ```

  A sale's parcel is created `Outbound` (`fulfillments/service.ts:112-118`), so
  `missing` is empty the moment the draft exists and `carrier_service_id` is
  never demanded. `checkout/rules.ts:45-62` adds only `items` and
  `recipient_address_id` for a sale, and `place.ts:51` gates placement on that
  list alone. `sale_quote.sql`'s `carriage` CTE INNER JOINs
  `shipping.services sv ON sv.id = sh.carrier_service_id`, so a null service
  makes the CTE empty, `money.shipping_charge` becomes `COALESCE(NULL, 0) = 0`
  and `shipping_service` becomes NULL. The customer is charged nothing for
  delivery and the business pays the carrier.
- not reproduced end to end (it needs a full sale placement); the two halves are
  each plain reads of the code above.
- fix: `missingFor` should demand `carrier_service_id` for an Outbound parcel
  too - the sale's delivery option IS a customer choice, priced from
  `shipping.services.price`.

### F8 The purchase invoice's "Shipping Fees" deduction includes the return leg; the Total it prints does not [severity: money]

- where: `documents/pdfs/service.ts:341` and `:374-388`;
  `db/pricing/sql/order_pricing.sql:99-107`
- proof: the document computes
  `shippingTotal = inboundShipment(order)?.cost + returnShipment(order)?.cost`
  and prints it as a Deduction, then prints `formatCurrency(total)` where `total`
  is `pricing.total`. `order_pricing.sql`'s `carriage` CTE is
  `WHERE sh.direction <> 'Return' … LIMIT 1`, so `pricing.total` subtracts the
  INBOUND leg only. On any cancelled order the printed line items do not add up
  to the printed Total, and the discrepancy is exactly the return label's cost.
  `renderInvoiceShippingAndPayout` (`render/sections.ts:143-201`) prints both
  legs' charges, so both numbers are on the same page.
  `pdfs/tests/documents-agree.test.ts` compares premiums between two documents
  and never checks that a document's lines sum to its own total.
- fix: pick one rule - either `order_pricing.sql` deducts the return leg too, or
  the invoice's deduction line reads `pricing.shipping_charge`. It must be the
  same number in both places.

### F9 The sales order invoice omits sales tax, so its charges do not sum to its total [severity: money]

- where: `documents/pdfs/service.ts:536-589`
- proof: the charges table prints Item Total, Shipping Fee, optional Credit
  Applied, optional Payment Fee, then
  `Total: money(order.totals?.total ?? 0)`. `orders.transactions.sales_tax` is
  written at placement (`orders/place.ts:235`) and `order.totals.sales_tax` is a
  declared field (`contracts/src/orders/transactions.ts:15`), but no row prints
  it - while `sale_quote.sql:103` makes it part of `base_total` and therefore of
  `order_total`. chain6 holds 10 sales orders, one of which carries
  `sales_tax = 18.67`; its invoice shows a Total 18.67 higher than its own lines.
  This is the document emailed to the refiner
  (`emails/service.ts:131-169` `sendSalesOrderToSupplier`).
- fix: add a Sales Tax row, from `order.totals.sales_tax`.

### F10 A customer who BUYS bullion is emailed a purchase-order packing list telling them to ship their items to Dorado [severity: rule]

- where: `documents/emails/service.ts:39-51` `sendCreatedEmail`;
  `orders/place.ts:44,259`
- proof: `placeSale` calls `world.confirm(order_id)` ->
  `sendOrderPlacedConfirmation` -> `sendCreatedEmail`, which branches on
  `isSale` for the email BODY and the order-number format (lines 49-51) but
  unconditionally attaches `pdfService.generatePackingList(input)` at line 45.
  `buildPackingListHtml` is purchase-shaped throughout: subtitle "Make sure to
  place this packing list in your package!"; `renderPackingShippingSection(order,
  false, …)` renders From = the customer, To = Dorado (`render/sections.ts:229-230`);
  the instructions page says "print off the label we have generated on your
  behalf and attach it to the outside of your package" and gives Dorado's
  address; `renderOrderSummaryTable` hardcodes `PO-` (`sections.ts:332`) so a
  sales order prints a PO number; and the final page embeds
  `shipment?.label`, which for a sale is null - a blank label page.
  `recordEmail` at line 75 then files it under kind `purchase_order_created`.
- fix: a sale's confirmation should attach the sales order invoice (or nothing),
  and the recorded kind should follow the direction.

### F11 The packing list prints a fabricated pickup slot - "8:30AM, today" - and contradicts the real one two sections below [severity: rule]

- where: `documents/pdfs/render/sections.ts:280-294`
- proof:

  ```ts
  8:30AM ${new Date().toLocaleDateString('en-US', { … })}
  ```

  The date is the moment the PDF is rendered and the time is a literal. The real
  slot exists in two places the same document already reads:
  `shipping.shipments.pickup_date` / `pickup_time` (added by migration 128
  exactly so a courier slot has a home - `docs/waves/boundary-feature.md`) and
  `order.pickup.requested_at`, which `buildPackingListHtml:74-77` prints
  correctly in the instructions block on the same PDF. So one document states two
  different pickup times, and a customer who re-downloads the packing list a week
  later is told the courier comes that day.
- fix: render `shipment.pickup_date` / `pickup_time`, and delete the literal.

### F12 Every return label is bought with HOLD_AT_LOCATION at the business's own FedEx Office [severity: rule]

- where: `providers/shipments/payloads.ts:118-127`;
  `providers/shipments/requests.ts:22-33` `returnLabelRequest`;
  `providers/shipments/constants.ts:83-93` `DEFAULT_HOLD_AT_LOCATION_DETAIL`
- proof: `createShipmentPayload` computes
  `wantsHoldAtLocation = options?.holdAtLocation !== false` and, when no
  `specialServices` is supplied, sets
  `specialServiceTypes: ['HOLD_AT_LOCATION']` with the hardcoded
  `locationId: 'ADSK'`, 13605 Midway Rd, Farmers Branch TX.
  `returnLabelRequest` builds `{shipper: DORADO…, recipient: <customer>}` and
  passes no `options`, so `options` is `undefined`, `undefined !== false` is
  true, and the customer's returned metal is shipped to a hold location beside
  the business instead of being delivered to them. That default is correct for
  `inboundLabelRequest` (whose recipient IS `FEDEX_STORE_ADDRESS`) and wrong for
  the one leg that goes the other way. `returnLabelRequest` also sets no
  `pickupType`, and `DEFAULT_EMAIL_NOTIFICATION_DETAIL` names
  shipping@doradometals.com as the `RECIPIENT` on a parcel whose recipient is the
  customer.
- not reproduced against the live carrier (tests refuse to call it -
  `providers/shipments/endpoints.ts:42-51`); read from the payload builder.
- fix: `returnLabelRequest` should pass `options: { holdAtLocation: false }`, or
  `createShipmentPayload` should default it from the direction rather than to
  true.

### F13 The build gate that is supposed to catch a FedEx label inside a transaction cannot see any carrier call [severity: rule]

- where: `api/src/shared/db/tests/transaction-side-effects.test.ts:12-17`
- proof: the `carrier` rule is `/\bprovider\.\w+\(|\bfedex\w*\.\w+\(/`. Every
  carrier call in `domains/` goes through the handler indirection -
  `shippingOps.createLabel(`, `shippingOps.createPickup(`,
  `shippingHandler.getTracking(`, `shippingHandler.cancelLabel(` - and none
  matches. Running the four EXTERNAL patterns over those exact source lines:

  ```
  "const labelData = await shippingOps.createLabel("            -> NO MATCH
  "? await shippingOps.createPickup("                           -> NO MATCH
  "trackingInfo = await shippingHandler.getTracking(carrier…"   -> NO MATCH
  "shippingHandler.cancelLabel(await carrierIdOr(null), …)"     -> NO MATCH
  ```

  The only lines in `domains/` that DO match `provider\.\w+\(` are the nine in
  `logistics/shipping/operations/handler.ts`, which contains no
  `withTransaction`. So the rule matches nothing that could ever be a violation.
  Today's code is fine (`labels.ts` buys outside a transaction), but the guard
  would not notice if that changed - which is the exact regression the test
  exists to prevent.
- fix: add `shippingOps\.|shippingHandler\.` (and `#providers/` imports
  generally) to the `carrier` pattern, and add a self-test the way
  `audit:test-leaks --self-test` does.

### F14 Admin fulfillment writes run outside a transaction: they are not atomic and they stamp no actor [severity: data]

- where: `logistics/fulfillments/controller.ts:32,39,44,91` (all four call the
  service with no executor); `logistics/fulfillments/service.ts:248-277`
  `setMethod`; `fulfillments/{pickups,directs}/controller.ts` `schedule*`;
  `fulfillments/methods/service.ts:47-54` `update`
- proof: `withTransaction` is the only issuer of
  `set_config('app.actor_id', …, true)` (`shared/db/withTransaction.ts:12-15`),
  and that setting is transaction-local. Migration 116's `audit_stamp` resolves
  the actor from it and, on UPDATE, writes `updated_by` / `updated_by_id` only
  `IF actor IS NOT NULL` (`116_*.sql:104-109,154-163`). So
  `POST /api/fulfillments/set_status` and `/set_method` leave
  `fulfillments.fulfillments.updated_by` naming whoever last touched the row
  inside a transaction - the audit trail silently misses every admin edit made
  through those endpoints.

  Worse, `setMethod` performs four independent writes on four pool checkouts:
  `fulfillments.update(id, {method_id})` (270), `pickups.remove` (272),
  `directs.remove` (273), `ensureDetail` (274). A failure between them leaves a
  fulfillment whose method says PICKUP with its pickup row deleted and no new
  detail - a state `missingFor` reads as "nothing missing" for SHIPMENT
  (`rules.ts:62`) or as "everything missing" for PICKUP.
- fix: wrap each controller in `withTransaction` and pass `tx` down, as
  `createFulfillment` (controller.ts:70) already does.

### F15 `cancelPickup` sends the carrier a UTC-derived date for a slot stored in local time [severity: rule]

- where: `logistics/shipping/pickups/service.ts:31`;
  `logistics/shipping/operations/service.ts:213-222`
- proof: `recordForShipment` writes
  `requested_at: \`${date} ${time || '00:00:00'}\`` - a bare string into a
  `timestamptz`, so Postgres interprets it in the session timezone.
  `cancelPickup` then derives the date FedEx is told to cancel with
  `requestedAt.toISOString().slice(0, 10)`, which is UTC. A 19:00 CDT pickup is
  stored as 2026-09-06T00:00Z and cancelled against 2026-09-06 - the wrong day,
  and FedEx's cancel then either fails or does nothing while the local row is
  marked `canceled` regardless (line 224-235, the update runs unconditionally
  after the carrier call). Invisible in tests because the suite runs `TZ=UTC`.
- fix: store the slot as the provider's own strings (which is what migration 113
  and `shipping.shipments.pickup_date/pickup_time` already do) and hand those
  back on cancel, rather than round-tripping through a timestamptz.

### F16 `ShipmentPatch.carrier_id` is required to travel with `tracking_number` and is then thrown away [severity: rule]

- where: `logistics/shipping/shipments/patch.service.ts:13,34-37`;
  `contracts/src/shipping/shipments.ts:43-51`; `shipping/rules.ts:421-425`
- proof: `assertTrackingPair` refuses a patch that names one without the other,
  so an admin entering a tracking number MUST also send a carrier id. Nothing
  then reads `body.carrier_id`: the branch calls
  `updateTracking(salesOrderId, body.tracking_number)`, which writes only
  `tracking_number` (`orders/service.ts:249-259`). The rule enforces a field that
  decides nothing - and the carrier the tracking number belongs to is silently
  whatever the shipment's `carrier_service_id` already says.
- fix: either write the carrier, or drop `carrier_id` from `ShipmentPatch` and
  delete `assertTrackingPair`.

### F17 The email paper trail can only record successes [severity: rule]

- where: `documents/emails/record.ts:23-27` (`EmailOutcome`), and all four
  callers in `documents/emails/service.ts:73,117,164,192`
- proof: `{ status: 'failed'; error }` is never constructed anywhere in `api/src`
  (grep for `status: 'failed'` returns only the type declaration and the ternary
  that reads it). Every `recordEmail` call passes `{ status: 'sent' }`, and a
  throw from `sendEmail` skips `recordEmail` entirely. For the placement
  confirmation the throw is additionally swallowed by `attempt`
  (`service.ts:31`), so a customer who never received their order confirmation
  leaves no row and no trace beyond a log line.
- fix: wrap the send in try/catch and record the `failed` outcome the type
  already describes.

### F18 Editing a carrier without re-sending its logo deletes the logo [severity: data]

- where: `logistics/shipping/carriers/service.ts:42`
- proof: `carriers.update(id, { logo: carrier.logo ?? null }, tx)`.
  `CarrierPatch` makes `logo` optional
  (`contracts/src/shipping/carriers.ts:28-35`), and `buildUpdate` deliberately
  skips `undefined` (`shared/db/patch.ts:32`) so an omitted key is left alone -
  but `?? null` converts the omission into an explicit clear before it gets
  there. Any `POST /api/carriers/update` that changes only the organization's
  name or email wipes the logo. This is the exact case the project's CRUD rule
  names: keys present are set, explicit null clears, omitted keys are untouched.
- fix: pass `{ logo: carrier.logo }`.

### F19 One NULL `max_insured_value` silently drops every label's insurance to zero [severity: money]

- where: `logistics/shipping/rules.ts:394-402` `lowestCeiling` / `ceilingFor`
- proof: `rows.map((r) => Number(r.max_insured_value)).filter(Number.isFinite)`.
  `Number(null)` is `0`, which IS finite, so a service row with a NULL ceiling is
  kept and `Math.min` returns 0. `clampInsuredValue` then returns
  `Math.min(amount, 0) = 0`, `sealForPlacement` writes `insured = false` and
  `declared_value = NULL` (`labels.ts:63-71`), and the label is bought with
  `declaredValue: 0` on a parcel of metal. `ceilingFor` has the same hole for a
  service whose own ceiling is NULL. Not live: all 11 rows in chain6's
  `shipping.services` carry `max_insured_value = 10000`. It is one admin edit
  away, and it fails silently and downward.
- fix: filter on `r.max_insured_value != null` before `Number`.

### F20 The public reviews endpoint discloses which staff member wrote or edited each review [severity: authz]

- where: `db/reviews/sql/get_public.sql`; `crm/reviews/routes.ts:7` (no
  middleware)
- proof: the projection includes `created_by, updated_by`, which migration 116
  fills with the ACTOR'S NAME for a text column (`116_*.sql:136-137,161-162`).
  chain6's `reviews.reviews` holds `created_by` values "Dorado Admin", "Dorado
  Metals", "Pedro Gonzalez" and `updated_by` "Pedro Gonzalez". `GET
  /api/reviews/public` is unauthenticated, so those names are on the public
  wire beside customer testimonials the same staff wrote.
- fix: drop `created_by`/`updated_by` from `get_public.sql`.

### F21 `display = false` does not gate the sell-side product list, including the two rows with a corrupt `type` [severity: rule]

- where: `catalog/products/controller.ts:25`; `catalog/products/routes.ts:17`
  (`GET /` has no middleware)
- proof: `display: q.side === 'ask' ? true : undefined`, and
  `db/products/repo.ts:32` skips the predicate entirely when the value is
  `undefined`. So `GET /api/products?side=bid` - unauthenticated - lists all 95
  of chain6's `products.bullion` rows, of which only 2 have `display = true`.
  Among them are the two rows whose `type` is `E'\n\tBar'`:

  ```
  1g Gold Bar        type='\n\tBar'  display=f  homepage_display=f
  Silver Bar (10 oz) type='\n\tBar'  display=f  homepage_display=f  slug=NULL
  ```

  CLAUDE.md records these as "not reachable today (both `display = false`, stock
  0, no order line references either)". They are reachable, publicly, on the bid
  storefront, and their `type` is what the storefront's type filter compares
  against. (`checkout/items/sql/create_from_product.sql` DOES gate on
  `b.display = true`, but only for a sale, so a purchase line can name one too.)
- fix: if the bid side deliberately shows undisplayed products, say so in the
  contract and give the bid side its own gate; either way CLAUDE.md's
  reachability claim needs correcting, and `type` needs the `btrim` D39 already
  describes.

## Verified correct

- `docs/waves/packing-list-nan.md`'s fix is present and behaves as described:
  `qty()` exists at `render/sections.ts:48` and is used in
  `buildPackingBullionRows`, `buildInvoiceBullionRows` and the sales invoice
  (`service.ts:421`), and `buildInvoiceScrapRows` guards `pre_melt`/`post_melt`
  with `?? '-'`. No path prints the literal `null`.
- `rules.group`'s `row.variant_group === ''` key is right: the column is NOT NULL
  with a `''` default in chain6 (0 nulls, 57 empties), so it cannot collapse
  every product into one family.
- `parcelWeightLb` is not silently zero for bullion. Every `orders.items` row in
  chain6 has `pre_melt` and `unit` (21 bullion rows, all `t oz`), because
  `checkout/items/sql/create_from_product.sql` copies `b.gross` into `pre_melt`.
- `formatAddressForFedEx`'s `is_residential ?? true` never fires in the
  production copy - `places.addresses.is_residential` has no nulls (100 t, 45 f).
- Every service name in the FedEx catalogue (`Express Saver`, `Priority
  Overnight`) resolves to a live `shipping.services` row for the FedEx carrier,
  so `labelServiceFor`'s name match cannot silently return the wrong ceiling.
  A shipment pointing at FedEx's `Free`/`Standard`/`Overnight` rows fails loudly
  (`assertCatalogueEntry`) rather than quietly.
- `attachToOrder` cannot steal a draft: `db/fulfillments/repo.ts:73` passes
  `whereNull: ['order_id']`, so the UPDATE matches only an unattached row and
  `assertDraft` sees the false.
- `fulfillments.pickups`/`directs` `update` and `remove` key on `fulfillment_id`,
  which is what the service passes - no silent zero-row UPDATE there.
- The email document routes DO check order ownership
  (`emails/controller.ts:21-33`), which is why F1 stands out as an omission
  rather than a policy.
- `db/orders/transactions/repo.ts` `update` takes an optional direction guard and
  `record()` uses `withTransaction` - the label's money write is atomic even
  though the label purchase before it is not.

## Simplifications

- `logistics/shipping/labels.ts:245-254` `serviceForFulfillment` has zero callers
  in `api/` or `packages/`. Dead.
- `logistics/fulfillments/service.ts:210-226` `choose` and `chooseById` have zero
  callers; only `chooseDefault` is used. Dead.
- `logistics/shipping/operations/service.ts:142-166`: the Outbound branch of
  `getFulfillmentRates` reads `parcel.recipient_address_id`, and nothing in
  `api/src` ever writes `shipping.shipments.recipient_address_id`. Every sale
  rate request therefore fails `assertAddressChosen`. The branch is unreachable
  in practice (sales are priced from `shipping.services.price`), so it is dead
  code that looks live.
- Two different functions named `handoffFor` with different contracts:
  `fulfillments/rules.ts:40-44` matches by derived method type and returns null;
  `shipping/rules.ts:98-102` matches by a boolean derived from a string literal
  and throws. Callers have to know which one they imported.
- `logistics/shipping/labels.ts:57-58`: `packagesRepo.getOne(shipment.package_id!)`
  is called twice in one expression, and the `rules.parcelFor(...)` result at
  line 52 is discarded - the call exists only for its assertions. Worth a name.
- `logistics/shipping/labels.ts:93-94`: the
  `?? rules.scheduleFromPickup(await fulfillmentPickups.forOrder(order_id)[0])`
  fallback reads `fulfillments.pickups`, which by construction is empty for a
  SHIPMENT fulfillment. Unreachable.
- `providers/shipments/utils/parsing.ts:36-41`: `trackingOutput!` is asserted
  non-null three times. An empty or error-shaped FedEx tracking response is a
  TypeError inside `getTracking`'s transaction, not a handled 502.
- `logistics/shipping/operations/service.ts:63-101`: `getTracking` makes the FedEx
  HTTP round trip INSIDE `withTransaction`, holding a pool connection open across
  it. Not irreversible, so not an F-level finding, but it makes carrier latency a
  connection-pool problem.
- `documents/pdfs/render/sections.ts:352,371,389,408`: `price ? formatCurrency(price) : '-'`
  prints a dash for a genuine `0`, where `formatCurrency` already handles null
  correctly. Same at `service.ts:297`.
- `documents/emails/controller.ts:35-40` `sendCreatedEmail` is exported but no
  route mounts it (`emails/routes.ts` mounts only `purchase_order_priced`).
- `providers/captcha/recaptcha.ts` is reachable only through
  `POST /api/recaptcha/verify-recaptcha`, which returns a boolean to the client.
  No write path consults it, and both public write surfaces in this area (leads,
  reviews) are `requireAdmin`, so the captcha protects nothing server-side.
- `logistics/shipping/services/service.ts:17-65`: `toNewRow` and `toPatchRow`
  re-spell twenty columns each, twice, purely to rename four (`supports_pickup`
  -> `supports_pickups`, `max_weight_lbs` -> `max_weight_lb`). The rename belongs
  in the SQL, as the wire-shape aliases elsewhere already are.
- `logistics/fulfillments/rules.ts:215-219` `assertTimestamp` accepts anything
  `Date.parse` tolerates, which includes `"2026"` and `"Sat"`. The column is
  `timestamptz`; Postgres would give a better error.
- `db/shipping/shipments/sql/{get_one,get_many,get_all}.sql` select `label` as
  raw `bytea` while `get_for_order.sql` returns `encode(label,'base64')`; the
  `OrderViewShipment` contract types it `z.string().nullable()` either way, and
  these three are cast rather than parsed. No route serves them today, so it is
  latent drift rather than a live bug.
