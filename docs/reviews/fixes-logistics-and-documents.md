# fixes: logistics, documents, catalog, crm

Lane C of the 2026-09-07 API review fixes, worktree `/home/jtj60/dorado-lanes/fixc`,
branch `fixc-lane`. Owned areas: `domains/{logistics,documents,catalog,crm}/**`,
`providers/{shipments,emails,pdfs,s3,places,captcha}/**`, the SQL under
`db/{fulfillments,shipping,products,organizations,leads,reviews,media}/`, and the
contracts for those.

One migration: **136_a_label_is_bought_once.sql** — applied to dev, `lint:migrations`
green, `000_genesis_schema.sql` and the contracts regenerated the way 132/133 did.
It carries two additive things and nothing else: a partial UNIQUE index on
`shipping.shipments (tracking_number) WHERE tracking_number IS NOT NULL`, and
`media.email_kind` gains `'sales_order_created'`.

---

## Per finding

### 2 — any customer downloads any order's documents (LD F1) — **FIXED**

`documents/pdfs/serve.ts` computed `entitled` and used it only to decide whether to
touch the CACHE; the fall-through rendered and returned the document to anyone.
`entitled` now gates the whole function through a new
`documents/pdfs/rules.ts` `assertEntitled`, which throws **`NotFound`** rather than
`Forbidden` so the answer cannot confirm somebody else's order exists.

Tests:
- `documents/pdfs/tests/serve.test.ts` — the test at :201 that pinned the leak is
  rewritten: a stranger is refused with `kind === 'not_found'`, the renderer is
  called **zero** times and the store is never read. A second new test pins that an
  anonymous caller is refused and an admin is not.
- `documents/pdfs/tests/replay.test.ts` — new: a signed-in stranger gets **404** on
  all four routes and no `application/pdf`; an admin gets 200. The four render
  tests that were calling as `TEST_CUSTOMER` now call as the order's own owner,
  which is what they always meant.

### 3 — a customer can point their parcel at any address row (LD F2) — **RULE FIXED, FK NOT WRITTEN**

`logistics/fulfillments/service.ts` `patchChoices` now proves the ADDRESS is the
fulfillment owner's before writing it, for `shipper_address_id`,
`recipient_address_id` and `pickup_address_id`. The owner is read from the ROWS —
`ownerOf()` = the checkout that points at the draft, else the order it belongs to —
never from the caller, so an **admin** patching a customer's fulfillment is held to
the CUSTOMER's book. The refusal is `rules.assertAddressIsTheirs` → `NotFound`.

**The FK migration 128 dropped cannot be restored as written, and this is the one
place I stopped short of the brief.** 123's guard was
`(user_id, <address column>) -> places.user_addresses (user_id, address_id)` on
`checkout.checkouts`, which HAS a `user_id`. 128 moved the columns onto
`shipping.shipments` and `fulfillments.pickups`, and **neither table has a user
column** — 128's own header says so: *"a statement about the CHECKOUT's owner that
no fulfillment row could make."* Restoring the composite key therefore means adding
a duplicated `user_id` to two logistics tables, writing it on every parcel/pickup
create, widening `ShipmentWrite` and the generated row contract, and re-deriving
genesis, the backfills and `audit:coverage`. **That is a schema-shape decision
(identity denormalised onto a logistics row), not a fix**, so it is Jacob's. The
DDL it would need, for the day it is taken:

```sql
ALTER TABLE shipping.shipments   ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE fulfillments.pickups ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE shipping.shipments   ADD CONSTRAINT shipments_shipper_address_theirs_fk
  FOREIGN KEY (user_id, shipper_address_id)
  REFERENCES places.user_addresses (user_id, address_id) ON DELETE SET NULL (shipper_address_id);
ALTER TABLE fulfillments.pickups ADD CONSTRAINT pickups_pickup_address_theirs_fk
  FOREIGN KEY (user_id, pickup_address_id)
  REFERENCES places.user_addresses (user_id, address_id) ON DELETE SET NULL (pickup_address_id);
CREATE INDEX ... ON shipping.shipments (user_id, shipper_address_id);
CREATE INDEX ... ON fulfillments.pickups (user_id, pickup_address_id);
```
(MATCH SIMPLE: a NULL `user_id` satisfies the key, so the column must be WRITTEN,
not merely added — that is the part that is a design call.)

Tests, in `logistics/fulfillments/tests/service.test.ts`:
- a SHIPMENT patch naming a stranger's address is refused `/no address/`, and the
  owner's own address is accepted in the same test (so the rule is not just "refuse
  everything");
- the same for a PICKUP patch's `pickup_address_id`.

### 12 — a label can be bought twice, and a bought label may never be recorded (LD F5) — **FIXED**

Four separate changes:
1. **The claim.** `labels.ts` `claim(shipment_id)` runs
   `db/shipping/shipments/sql/claim_for_label.sql` — ONE statement,
   `UPDATE ... SET shipping_status = 'Label Pending' WHERE id = $1 AND tracking_number
   IS NULL AND shipping_status IS DISTINCT FROM 'Label Pending' RETURNING id`. Two
   concurrent buys serialise on the row lock; the loser matches zero rows and is
   refused by `rules.assertClaimed` (Conflict). The claim is taken **before** the
   carrier call and its transaction ends before it.
2. **`buyReturnLabel` had no `assertUnlabelled` at all.** It has one now, plus the
   same claim.
3. **A second cancel is refused rather than orphaning the first label.**
   `shipments/service.ts` `returnLeg` calls `rules.assertReturnNotBought`, so an
   order whose return leg already carries a tracking number cannot be cancelled
   again; an UNLABELLED return leg is reused instead of a second one being minted.
4. **The database enforces it too** — migration 136's partial unique index means a
   bought label can only ever be recorded on one shipment row.

What is NOT fixed and is deliberate: if `record()`'s transaction fails, the label is
bought and the shipment stays `Label Pending` with no tracking number. That is
strictly better than today (no second label is ever bought silently) but the number
is still only in the log. Voiding it would need a catch-compensate-rethrow, which
ruling 52 allows only as its named second exception and which lives in the cancel/
place use cases (lane A), not here.

Tests, `logistics/shipping/tests/buy-label.test.ts`: a second claim answers false and
`buyLabel` then refuses `/already having a label bought/`; a shipment that already
carries a tracking number cannot be claimed; `buyReturnLabel` refuses a labelled leg;
two shipments cannot hold one tracking number (`shipments_tracking_number_unique`).

### 13 — a second shipment on one fulfillment, "the parcel" picked at random; pickup/appointment orders cannot be cancelled (LD F3, LD F4) — **FIXED IN LOGISTICS; ONE CALL CHANGE IS LANE A's**

**The return leg is its own kind of link, never "the parcel".**
- `db/fulfillments/sql/view.sql` — the `parcel` subselect now excludes
  `s.direction = 'Return'` and orders by `s.created_at ASC NULLS FIRST, s.id ASC`
  instead of `fs.id ASC` (a random uuid). The handover is the earliest non-Return leg,
  which is also right for a sale whose refiner Outbound leg is minted later.
- `db/fulfillments/shipments/sql/get_for.sql` — joins `shipping.shipments` and orders
  `(s.direction = 'Return') ASC, s.created_at ASC NULLS FIRST, s.id ASC`, so
  `shipmentIdOf`, `patchChoices` and `getByOrder` all describe the handover leg.
- `logistics/fulfillments/service.ts` gains `categoryOfOrder(order_id)` and
  `linkReturn(order_id, shipment_id, tx)` — the return link **does not call
  `assertCategory`**, which is what made a PICKUP/APPOINTMENT order uncancellable.
- `logistics/shipping/shipments/service.ts` gains **`returnLeg(order_id, patch, tx)`**
  and `returnLegOf(order_id)`. `returnLeg` answers `null` when the order's fulfillment
  is not a SHIPMENT — a pickup or appointment cancel simply has no return label —
  reuses an unlabelled return leg, refuses a second cancel, and applies the patch.

**LANE A MUST CHANGE `orders/service.ts` `cancel` (see "For lane A" below).** Until it
does, `cancel` still calls `shipmentService.create(order_id, 'Return', tx)`, which
still fails for a PICKUP order. Everything it needs is exported and tested.

Tests, `logistics/shipping/shipments/tests/service.test.ts`: the return leg never
becomes the fulfillment's parcel (view, `getByOrder`, `returnLegOf` all checked with
two links present); a pickup order answers `null` rather than raising; a second cancel
is refused; an unlabelled return leg is reused and both patches survive.
`logistics/fulfillments/tests/unit.test.ts` pins the new `get_for` ordering.

### 19 — admin fulfillment writes outside a transaction, no actor (LD F14) — **FIXED**

`fulfillments/controller.ts` (`cancelSchedule`, `setMethod`, `setStatus`,
`patchFulfillment`), `fulfillments/{pickups,directs}/controller.ts` `schedule*` and
`fulfillments/methods/controller.ts` `updateMethod` all wrap in `withTransaction` and
pass `tx` down, as `createFulfillment` already did. `methods/service.ts` `update` takes
a required `tx` (ruling 56). `setMethod`'s four writes are now one transaction.

Tests, `logistics/fulfillments/tests/schedule.test.ts`: `POST /set_status` stamps
`updated_by_id` = the admin who called it; `POST /set_method` stamps it too and its four
writes land together (method changed, old detail row gone, new one present).

### 20 — carrier edit deletes the logo; `organizations.update` nulls every field not sent (LD F18, MA F3) — **FIXED**

- `db/organizations/repo.ts` `update` passes `row ?? {}` straight to `buildUpdate`
  instead of coalescing four fields to `null`. Keys present are set, explicit null
  clears, absent keys untouched.
- `db/shipping/carriers/repo.ts` `update` uses `buildUpdate` too. `sql/update.sql` is
  DELETED: it wrote `SET logo = $1`, and an omitted logo arrives as `undefined`, which
  the driver binds as NULL — so `buildUpdate` was the only fix that works.
- `logistics/shipping/carriers/service.ts` passes `{ logo: carrier.logo }`, no `?? null`.

Tests, `logistics/shipping/carriers/tests/service.test.ts`: new — an edit naming only
the organization leaves the logo, email and phone alone. The existing "update changes
both" test stopped spreading the READ row over the patch (it was sending `id`, which is
not a patchable column and is refused by `parseStrict` over HTTP anyway).
`carriers/tests/unit.test.ts` no longer asserts `sql/update.sql` exists.

### 23 (second half) — the email trail records successes only (LD F17) — **FIXED**

`EmailOutcome`'s `{ status: 'failed'; error }` was never constructed anywhere. Ruling 52
forbids try/catch under `domains/`, so the catch lives in the provider:
`providers/emails/nodemailer.ts` gains `deliver(message, transport)` returning
`{ sent: true, result } | { sent: false, error }`. `documents/emails/service.ts`'s four
sends call it, record `rules.outcomeOf(delivery)` — a real `failed` row with the
provider's message — and then `rules.assertDelivered(delivery)` **rethrows**, so the
failure still propagates exactly as before (the live `POST /purchase_order_priced`
depends on it). New file `documents/emails/rules.ts` holds both.

Tests, `documents/emails/tests/paper-trail.test.ts`: the two tests that asserted ZERO
rows on a failed send now assert one `failed` row carrying the error and no
`provider_message_id`, and the throw still reaches the caller.

### 24 — return metal uninsured; one NULL `max_insured_value` zeroes every label (MP F5, LD F19) — **FIXED IN LOGISTICS; ONE CALL CHANGE IS LANE A's**

- `logistics/shipping/rules.ts` `lowestCeiling` / `ceilingFor` filter
  `max_insured_value != null` **before** `Number`. `Number(null)` is 0 and 0 is finite,
  so one NULL row made `Math.min` answer 0, `clampInsuredValue` returned 0,
  `sealForPlacement` wrote `insured = false` and the label was bought with
  `declaredValue: 0` on a parcel of metal.
- `rules.returnDeclaredValue(inboundDeclared, orderTotal)` is the amount a RETURN leg is
  insured for: the greater of the order total and **what the customer declared on the
  way in**. `labels.returnDeclaredValue(order_id, order_total, service_code)` exposes it
  clamped, for cancel to call.

Tests, `logistics/shipping/tests/rules.test.ts` (unit) and
`logistics/shipping/tests/buy-label.test.ts` (a cancel before pricing insures the
return for the inbound declared value, not for 0).

### 25 — charge re-quoted with a pickup type the checkout never sent; a sale can be placed with no delivery service (LD F6, LD F7) — **FIXED**

- `logistics/shipping/operations/service.ts` `getFulfillmentRates` resolves the
  fulfillment's own handoff (`shippingRules.handoffFor(handoffs, view.method.type)`) and
  passes `handoff.code` where it passed literal `undefined`. Both quotes now ask FedEx
  the same question.
- `logistics/fulfillments/rules.ts` `missingFor`: the SHIPMENT branch no longer returns
  an empty list the moment the parcel is not Inbound — a sale's Outbound leg owes
  `carrier_service_id`, because `sale_quote.sql` INNER JOINs `shipping.services` and a
  null service prices the customer's delivery at zero.

Tests: `providers/shipments/tests/payloads.test.ts` (new) pins that a rate quote carries
the pickup type it is given and that `rateParcel` derives the SAME code from the parcel
that will be labelled; `logistics/fulfillments/tests/unit.test.ts` pins that an Outbound
parcel with no service reports `['carrier_service_id']` and with one reports `[]`.
**Not pinned end to end**: there is no cassette for the fulfillment-rates request shape
(`fulfillment-rates.test.ts` says so in its own `test.skip`), so nothing asserts the
bytes FedEx receives. A cassette for it is worth adding.

### 26 — purchase invoice deducts the return leg but its total does not; sales invoice omits tax (LD F8, LD F9) — **FIXED**

- `documents/pdfs/service.ts` `buildInvoiceHtml`: the "Shipping Fees" deduction is
  `pricing.shipping_charge` — the number `pricing.total` was actually made from — not
  `inbound.cost + return.cost`. Nothing is recomputed in the document.
- `buildSalesOrderInvoiceHtml` prints a **Sales Tax** row from
  `order.totals.sales_tax` when it is non-zero.

Tests, `documents/pdfs/tests/documents-agree.test.ts`: every dev purchase invoice's own
lines sum to its printed Total and its deduction equals `pricing.shipping_charge`; a
fabricated Return leg injected into an order does not move the deduction (dev holds no
cancelled order, so this is what actually reproduces F8); the sales invoice prints the
tax it charged, and prints no row when there is none.

### 27 — buyers get a purchase packing list; packing list prints a fabricated pickup slot (LD F10, LD F11) — **FIXED**

- `documents/emails/service.ts` `sendCreatedEmail` branches on direction for the
  ATTACHMENT as well as the wording: a sale gets `generateSalesOrderInvoice`, stored as
  pdf kind `sales_order_invoice`, filed under the new email kind
  **`sales_order_created`** (migration 136). A buyer is no longer emailed a
  purchase-shaped packing list telling them to ship their metal to Dorado, with a blank
  label page and a `PO-` number on it.
- `documents/pdfs/render/sections.ts` prints `shipment.pickup_time` +
  `shipment.pickup_date` (128's columns, the provider's own strings) and the literal
  `8:30AM ${new Date()...}` is gone.

Tests: `documents/emails/tests/service.test.ts` now pins the sale's attachment as
`SO - NNNNNN_invoice.pdf`; `documents/pdfs/tests/documents-agree.test.ts` asserts no
packing list prints `8:30AM`.

### 33 — the transaction-side-effects gate cannot see any carrier call (LD F13) — **NOT FIXED (lane B's folder)**

`api/src/shared/db/tests/transaction-side-effects.test.ts` is under `shared/**`. Exact
change wanted, for lane B:

```diff
-  carrier: /\bprovider\.\w+\(|\bfedex\w*\.\w+\(/,
+  carrier: /\bprovider\.\w+\(|\bfedex\w*\.\w+\(|\bshippingOps\.\w+\(|\bshippingHandler\.\w+\(/,
```

Verified against the four real call sites — `shippingOps.createLabel(`,
`shippingOps.createPickup(`, `shippingHandler.getTracking(`,
`shippingHandler.cancelLabel(` — none of which matches today, so the rule matches
nothing that could ever be a violation. A `--self-test` in the style of
`audit:test-leaks --self-test` (feed the rule those four literal lines and assert it
fires) is what stops it rotting again. Today's code still passes: `labels.ts` buys
outside a transaction, and the claim's transaction ends before the carrier call.

### 34 — `cancelPickup` sends a UTC-derived date for a local slot (LD F15) — **FIXED**

`shipping.pickups.requested_at` is a timestamptz written from a bare local string;
`requestedAt.toISOString().slice(0,10)` therefore answered UTC's day and a 19:00 CDT
pickup was cancelled against the wrong date. `operations/service.ts` `cancelPickup` now
reads the parcel (`shipmentRepo.getById(pickup.shipment_id)`) and uses
`rules.pickupDateFor(parcel?.pickup_date, requested_at)` — 128's `pickup_date` text
column, which IS the string the customer asked for. Unit test in
`logistics/shipping/tests/rules.test.ts`, including the TZ=UTC case the suite hides.

### 36 — public reviews disclose staff ids (LD F20) — **FIXED**

`db/reviews/sql/get_public.sql` drops `created_by` / `updated_by` (116 fills them with
the ACTOR'S NAME) and casts its two timestamps with the `to_char` the contract parse
needs. New contract `PublicReview` = `Review` minus `user_id`, `order_id` and the four
audit columns; `db/reviews/repo.ts` `getPublic` PARSES through it, so a column added to
the projection later cannot leak silently.

Tests: `crm/reviews/tests/repo.test.ts` — a new review with a stamped author appears on
the public list with none of the five fields and a string `created_at`;
`crm/reviews/tests/replay.test.ts` — the assertion that recorded the leak (and invited
its own deletion) now asserts the opposite over HTTP.

### 37 — `display = false` does not gate the sell-side list (LD F21) — **DELIBERATE, PINNED, NOT CHANGED**

This is **ruling 49** (Jacob, 2026-09-03): *"We can show all of them on sell tab. We
can't show all of them on buy."* `GET /api/products?side=bid` listing every
`products.bullion` row is the ruling working as written, not a defect. Said so in the
contract — a comment on the controller's `Query`, where `side` is the gate — and pinned
both halves in `catalog/products/tests/service.test.ts`: an undisplayed product is
absent from the buy side and present on the sell side, with the note that this is the
test to rewrite if the bid side ever gets a gate.

**What LD F21 is right about is CLAUDE.md.** Its `audit:enum-domains` entry still says
the two rows whose `type` is `E'\n\tBar'` are *"not reachable today (both `display =
false`, stock 0, no order line references either)"*. They are reachable, publicly, on
the bid storefront. **That sentence needs correcting and I did not edit CLAUDE.md** —
it is shared by three lanes this session. The `btrim` those two rows need is D39 and is
an UPDATE against production, which is Jacob's.

### 38 — upstream carrier HTTP status becomes the API's own (MA F11) — **NOT FIXED (lane B's folder)**

`api/src/shared/middleware/errorHandler.ts:286-299` is under `shared/**`. Exact change
wanted, for lane B:

```ts
const upstream = safe.kind === 'axios'
const raisedStatus = Number(raised.statusCode ?? raised.status)
const status =
  domainStatus ||
  (upstream ? 502 : 0) ||
  (Number.isInteger(raisedStatus) && raisedStatus >= 400 && raisedStatus <= 599
    ? raisedStatus
    : 500)
```

Two defects, one line: a FedEx 401 is answered to a signed-in customer as this API's own
"you are not authenticated", and a FedEx 403 as "that is not yours". The body already
carries `carrier_status` / `carrier_transaction_id`, so nothing is lost by answering
502. And `raised.status` is typed `unknown` and reaches `res.status(...)`, which throws
in Express 5 for a non-numeric value — hence the `Number.isInteger` coercion.

### 41 (first half) — `ShipmentPatch.carrier_id` required then discarded (LD F16) — **FIXED**

`assertTrackingPair` forced an admin to send a `carrier_id` alongside a tracking number
and nothing ever read it. Dropped from the contract (`contracts/src/shipping/shipments.ts`),
`rules.assertTrackingPair` deleted, and `patch.service.ts` no longer calls it. The
carrier a tracking number belongs to is whatever the shipment's `carrier_service_id`
already says. Test: `orders/tests/update-tracking.test.ts` — the two existing tests stop
sending it, and a new one pins that sending it is now a 400.

### 32 — every return label HOLD_AT_LOCATION at the business's FedEx Office (LD F12) — **DECISION, PINNED, NOT CHANGED**

Jacob has not ruled. `providers/shipments/tests/payloads.test.ts` pins TODAY'S
behaviour: `returnLabelRequest` passes no `options`, `createShipmentPayload`'s
`options?.holdAtLocation !== false` is therefore true, and the payload carries
`specialServiceTypes: ['HOLD_AT_LOCATION']` with a named `locationId`. The test says in
its own message that it is the one to rewrite when the decision is made. The fix, when
it is: `returnLabelRequest` passes `options: { holdAtLocation: false }`, or
`createShipmentPayload` defaults it from the direction rather than to `true`.

---

## For lane A (orders/**, checkout/**, pricing/**)

**1. `orders/service.ts` `cancel` — REQUIRED, finding 13 is not closed without it.**
Replace the existing-Return lookup, the `shipmentService.create(order_id, 'Return', tx)`
and the separate `shipmentService.update`, and read the insured amount from logistics:

```ts
const declaredValue = await shippingLabels.returnDeclaredValue(
  order_id,
  order.totals?.total ?? null,
  service.code
)
const insured = declaredValue > 0

const shipment_id = await withTransaction(async (tx) => {
  await ordersRepo.update(order_id, { spots_locked: false }, {}, tx)
  for (const spot of await orderSpots.getRowsFor(order_id, tx)) {
    await orderSpots.update(order_id, spot.metal_id, { bid: null }, tx)
  }
  return await shipmentService.returnLeg(
    order_id,
    { package_id, carrier_service_id, insured, declared_value: insured ? declaredValue : null },
    tx
  )
})

if (shipment_id) await buy(shipment_id)      // null = a pickup/appointment order:
                                             // cancelled, with nothing to post back
```

- `returnLeg` answers `null` for a PICKUP/DIRECT fulfillment — that is finding 13's
  second half, and the cancel must treat it as success, not as an error.
- It refuses (Conflict, `/already been cancelled/`) when a return label was already
  bought — that is finding 12's third gap.
- `returnDeclaredValue` is finding 24's first half: a purchase cancelled BEFORE
  `finalizePricing` has `totals.total` null, and the old
  `shippingRules.declaredValue(order.totals?.total ?? 0)` sent the metal back
  uninsured. It floors the value at what the customer declared inbound.
- `orders/rules.ts` `assertReturnable` demands an address snapshot; check it holds for a
  PICKUP order before relying on the null path.

**2. `orders/place.ts:182` — finding 12's fourth gap, NOT fixed here.** The bare
`await world.buyLabel(placed.shipment_id)` after the commit throws out of `place()` on a
FedEx outage: the order is committed, the basket is not cleared, no confirmation is
sent, and the customer sees a failure on an order that exists. Line 184 next to it is
already wrapped in `attempt`. Wrap this one the same way (or catch-compensate as ruling
52's second exception allows) so a carrier failure leaves the order placed and reports
itself.

**3. Two lane-A test files I edited, minimally, because my changes broke them.** Both
diffs are behavioural consequences, not opinions — re-apply or adjust as you like:
- `orders/tests/place.test.ts` `primeCheckout` — the `patchChoices` call MOVED to after
  the checkout row is inserted and linked (an unattached draft has no owner, so finding
  3's rule has no book to check against; `createForCheckout` links first for the same
  reason). Three lines moved, nothing else.
- `orders/tests/place-sale.test.ts` — two assertions changed
  `_packing_list.pdf` → `_invoice.pdf` (finding 27: a sale's confirmation carries the
  sales order invoice).
- `orders/tests/update-tracking.test.ts` — the two `PATCH /api/shipments/:id` bodies
  stop sending `carrier_id` (finding 41), plus one new test pinning that sending it is
  a 400.

**4. `db/pricing/sql/order_pricing.sql` is untouched, on purpose.** Finding 26 offered
two rules — deduct the return leg in pricing, or print `pricing.shipping_charge` in the
document. I took the second, because the document must print the order view's numbers
and recompute nothing. If lane A would rather the payout deducted the return label too,
that is a money change and the document follows it for free.

## For lane B (shared/**, transactions/**, accounts/**, providers/payment/**, app.ts, env.ts, scripts/seed-*)

- **Finding 33** — `shared/db/tests/transaction-side-effects.test.ts`, the `carrier`
  regex plus a self-test. Diff above.
- **Finding 38** — `shared/middleware/errorHandler.ts`, upstream failures answer 502 and
  `raised.status` is coerced through `Number.isInteger`. Snippet above.
- **Nothing else.** `shared/testing/builders/fulfillments.ts` already attaches the
  checkout before it patches, so finding 3's rule does not disturb it, and
  `scripts/seed-e2e-order.mjs` patches a draft that `createForCheckout` has linked.
  **If either starts failing with `no such fulfillment` out of
  `assertFulfillmentOwner`, that is finding 3's rule and the fix is to link the
  checkout first, not to weaken the rule.**

## Gate

`pnpm check` is green on every member EXCEPT the two below, and neither is this
lane's work:

- **`figma:inventory`** — 12 findings in `packages/components` / `scripts/figma/`,
  untouched here and pre-existing. Jacob's.
- **`verify:genesis`** — `000_genesis_schema.sql` is stale against DEV, and the stale
  part is **not mine**. The shared remote dev database now carries
  `auth.users users_dorado_funds_non_negative` (finding 5) and rewritten
  `metals.fine_content` / `metals.convert_to_troy_oz` (findings 9 and 10) — lanes A and
  B, migrated into the same dev database this lane reads. I regenerated genesis for
  136, then **reverted it to my own two lines** (the `media.email_kind` value and the
  partial unique index) rather than committing another lane's DDL into a generated file
  I do not own. It goes green when their genesis regeneration lands. **Whoever merges
  last must re-run `pnpm --filter @dorado/api dump:schema`.**

  The eight dev-database members behind it were run individually and **all pass**:
  `contracts:validate`, `contracts:verify:fresh`, `audit:coverage`, `audit:indexes`,
  `audit:query-paths`, `audit:constraints`, `audit:non-finite`, `audit:nullability`,
  and `validate:wire` (34 shapes match, 0 diverge). `lint:migrations` 0.
  `pnpm --filter @dorado/api test`: **238 files, 1393 passed, 1 skipped, exit 0.**

Two lint ACCEPTED maps moved, both because a finding was fixed rather than excused:
`lint:no-throw-in-services` loses its only entry (`fulfillments/owner.ts` raises
through `rules.assertOwnedDraft` now) and `lint:no-literal-views`'s pin for
`documents/pdfs/serve.ts` drops 4 → 3 (the fall-through that leaked the document is
gone). Both counts were re-measured, never lowered to pass.

## For Jacob

- **Finding 3's foreign key** is a schema decision (a `user_id` on `shipping.shipments`
  and `fulfillments.pickups`). The rule is in place either way; the FK is defence in
  depth. DDL above.
- **Finding 32** — is HOLD_AT_LOCATION on return labels intended? Pinned as-is.
- **CLAUDE.md's `audit:enum-domains` entry** calls the two corrupt-`type` products "not
  reachable today". They are reachable, unauthenticated, on the bid storefront. One
  sentence to correct; I did not touch the file because three lanes share it.
- **Migration 136's unique index will fail on any database where two shipments already
  share a tracking number.** It applied clean to dev. If it fails on production, it has
  found the orphaned-label state finding 12 describes — read the two rows, do not drop
  the index.
