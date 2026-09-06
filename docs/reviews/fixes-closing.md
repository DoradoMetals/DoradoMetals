# Closing the review: the cross-lane hand-offs, and rulings 87-90

Lane D of the 2026-09-07 API review, worktree `dorado-lanes/fixd`, branch
`fixd-lane`, on top of the three merged fix lanes. Four migrations:
**137** (a parcel belongs to somebody), **138** (volume everywhere, tax only
where nexus is), **139** (the return location is a row), **140** (the parcel
moves with the book). Genesis, `047_seed_reference_data.sql` and the contracts
were regenerated the way 132-136 did; `lint:migrations` is green.

Every change below has a test that fails before it and passes after.

---

## Part 1 - the hand-offs the three lanes left at their boundaries

### Lane C -> orders: `cancel` goes through `shipments.returnLeg` (findings 13, 24, 12)

`orders/service.ts` `cancel` no longer mints its own Return shipment. It reads
the insured amount from logistics -
`shippingLabels.returnDeclaredValue(order_id, order.totals?.total ?? null,
service.code)`, which floors the value at what the customer declared on the way
IN - and writes through `shipmentService.returnLeg(order_id, patch, tx)`. When
that answers `null` the order is cancelled and no carrier is called at all.
`shippingRules.assertReturnShipment` died with the code that used it.

**One thing lane C's `returnLeg` did not distinguish, and now does.** It
answered `null` both for a PICKUP order (correct: nothing travels back by post)
and for an order with NO fulfillment at all (wrong: that would cancel the order
and silently keep the customer's metal). `rules.assertHandoverKnown` refuses the
second. The test builder learned `anOrder(...).withFulfillment(method)`, because
a real order always reaches the database with one and three test fixtures did
not.

**Tests** (`orders/tests/cancel.test.ts`): *"a pickup order is cancelled with no
return label at all"* - the carrier is asked for nothing, no return parcel is
minted, the spots still unpin. *"a cancel before pricing insures the return for
what came in, not for zero"* - an order with no totals, whose inbound leg
declared 4000, insures the return. Before the change the first cancelled through
`chooseDefault` and bought a label, and the second sent the metal back
uninsured.

### Lane C -> shared, finding 33: the side-effects gate can see a carrier call

`shared/db/tests/transaction-side-effects.test.ts`'s `carrier` rule now matches
`shippingOps.*(` and `shippingHandler.*(` as well, and a self-test in the same
file feeds it the four real call shapes (and an innocent `ordersRepo.update`)
through the same `EXTERNAL` table the real check uses, so the two cannot drift.

**The widened rule immediately found a real violation, which is the point of
widening it.** `logistics/shipping/operations/service.ts` `getTracking` opened a
transaction and then called FedEx inside it, holding a connection across a
network round trip. The carrier is now asked BEFORE the transaction opens; the
replace of the scan history (delete then insert) is still atomic, which is what
that transaction was for.

### Lane C -> shared, finding 38: an upstream failure is not this API's status

`shared/middleware/errorHandler.ts` answers **502** for any axios-classified
failure, so a FedEx 401 is no longer told to a signed-in customer as "you are
not authenticated" and a FedEx 403 as "that is not yours". `raised.status` is
coerced through `Number.isInteger` before it reaches `res.status(...)`, which
throws in Express 5 on a non-numeric value. Tests in
`shared/middleware/tests/errorHandler.test.ts` cover a carrier 401 and 403, a
network failure with no status, a non-numeric status, an object status, a domain
error and a plain Error. Two existing assertions changed with the behaviour they
pinned (`400.5` is now 500; a network failure is now 502).

### Lane B -> orders, finding 5: the refusal is a domain error

`credit.removeFunds` refuses below zero. `placeSale` already re-read the balance
`FOR UPDATE` and refused through `rules.assertCreditCovers` (a **Conflict**, 409,
naming what happened) before reaching it, so neither guard can surface as a 500;
`removeFunds`' own refusal is an `Invalid` behind it, and 134's CHECK behind
that.

**Test** (`orders/tests/place-sale.test.ts`): *"a balance spent between pricing
and placement is refused, not charged twice"* - a real quote applies credit, the
balance is then emptied, and both guards are run in the order the placement runs
them: the rule refuses with `kind === 'conflict'`, `removeFunds` refuses after
it, and the balance does not move. The two guards are assembled by the test
rather than driven end to end **because `placeSale` re-prices from the balance
it locks**: the window between the quote and the debit is a genuine race, and
there is no seam that opens it deterministically. Three layers cover it and each
is pinned separately.

### Lane A -> lane B: what was outstanding

Nothing was left undone. Lane A asked for `removeFunds` to grow a floor of its
own (lane B did it, with `balanceForUpdate` + `refuseNegativeBalance` on the
caller's `tx`), and warned that its two refusal tests matched on the constraint
name; both still pass because the database is still the layer that refuses when
the service is bypassed. The `134`/`135` numbering was already reconciled - dev
holds exactly one `users_dorado_funds_non_negative` - and the `media.pdfs` entry
in `scripts/verify-backfill.mjs` exists once, not twice.

### Finding 3's schema half: the composite key is back (137 + 140)

Lane C restored the RULE (`patchChoices` proves an address is the fulfillment
owner's) and left the KEY as a schema decision. It is taken.

`shipping.shipments` and `fulfillments.pickups` carry a denormalised `user_id`,
and three composite keys - `(user_id, shipper_address_id)`,
`(user_id, recipient_address_id)`, `(user_id, pickup_address_id)` -> 
`places.user_addresses (user_id, address_id)`, `ON DELETE SET NULL` on the
address column only, the way 123-126 wrote them. The backfill fills the owner
from the checkout that points at the draft, else the order the fulfillment
belongs to, and only where every address the row already carries resolves in
that owner's book, so the keys go on VALID without a scan that could fail on
history. They applied clean to dev and to the local test database.

The column is WRITTEN, not merely added: `MATCH SIMPLE` means a NULL `user_id`
satisfies the key whatever the address column holds. `patchChoices` stamps the
owner (`claimOwner` on each repo) **before** it writes an address, and the
generated patch contracts omit `user_id` so no caller can move a parcel into
somebody else's book by sending a field.

**140 exists because the suite found the same flow 123 broke.** Ruling 63's
visitor adoption re-keys `places.user_addresses.user_id`, and for the length of
that one statement the book entry has moved and the parcel has not. There is no
order that works, so - exactly as 125 and then 126 concluded - the keys are
`DEFERRABLE INITIALLY IMMEDIATE` and `adopt.ts` asks for the deferral itself,
then re-keys the visitor's parcels and pickups in the same transaction.
`CheckoutAdoptionResult` gains `parcels`. ON UPDATE CASCADE was refused for
126's reason: it would move a parcel to another owner as a side effect of an
address-book edit, with no code saying so.

**Tests**: `logistics/fulfillments/tests/service.test.ts` - the parcel and the
collection each carry the owner after a legitimate patch, and a statement that
BYPASSES the service is then refused by the database (`shipments_shipper_
address_theirs_fk`, `pickups_pickup_address_theirs_fk`).
`checkout/tests/adopt.test.ts` - *"a visitor's parcel changes hands with the
address book it points at"*.

### The orphan ledger row

`exchange.schema_migrations` on dev still holds a row named
`134_a_balance_cannot_go_below_zero.sql`, from lane B's file before it was
renumbered to 135. **It is Jacob's and it is not deleted here.** It is inert:
`migrate.mjs` iterates over migration FILES and looks each one up in the ledger,
so a ledger row with no file is never read, never re-run and never warned about.
`migrate:status` shows nothing pending.

### The shipment builder minted colliding tracking numbers

`shared/testing/builders/shipping.ts` built a tracking number as
`` `7941${aTag()}`.slice(0, 12) ``. `aTag()` is a six-character prefix plus a
three-character counter, and the slice dropped the counter's last character - so
two shipments built in one test file collided on 136's
`shipments_tracking_number_unique`. Two tests in
`shared/middleware/tests/ownership.test.ts` failed on it at the tip of dev,
before this lane changed anything. The number is now derived from the id the
DATABASE minted for the row, so every built shipment is unique.

---

## Part 2 - the four rulings

### Ruling 87 - collect where nexus is reached, count volume everywhere

**Migration 138** adds `sales_volume numeric(16,2)` and `sales_count integer` to
`tax.sales_tax`, both defaulting to zero: the running total starts today, and an
invented figure for the sales that were never counted would be worse than an
honest zero.

- **The quote half.** `db/pricing/sql/sale_quote.sql` no longer takes the
  `COLLECTING_NEXUS_TAXES` flag. A line's rate is the matching rule's rate only
  where `tax.sales_tax.reached_nexus` is true; a state with no row has not
  reached nexus either, so the `COALESCE` is false and the rate is zero.
  `pricing/service.ts` stops reading the environment variable.
- **The accrual half.** `db/sales-tax/sql/accrue.sql` is one statement with two
  facts: `sales_volume` and `sales_count` move for EVERY state, `amount_owed`
  moves only `WHEN reached_nexus`. The two halves now agree by construction.
  `updateStateSalesTax(tax, volume, state, tx)` observes the row count and
  `pricing/rules.assertAccrued` refuses tax charged for a state that has no
  `tax.sales_tax` row to owe it - the one case where a zero-row UPDATE is a
  fault rather than the normal answer.

`place.ts` passes `quote.item_total` as the volume: nexus is measured on sales
into the state, and that is the sale of goods the state's rules were applied to.

**Tests**: `pricing/tests/sales-tax.test.ts` - *"a state that has not reached
nexus is charged no tax, and one that has is"* (the same basket, both ways), and
*"volume is recorded in every state; money is owed only where nexus is
reached"*. The pinned `FINDING MP F3` test is gone, replaced by these two.
`db/sales-tax/tests/repo.test.ts`'s below-threshold test now also asserts the
volume moved.

### Ruling 88 - credit is reserved at placement and returned on expiry or cancel

The reservation is a `payments.ledger` row tied to the order. No migration: the
`type` column is text and nothing was missing.

- **Placement** calls `credit.reserve(user_id, amount, order_id, tx)` - the
  balance moves (so nobody can spend it twice) and a `Reserve` row records why.
  Before, the debit wrote nothing at all, which is why `hasCreditFor` was the
  only thing standing between a customer and two refunds.
- **Cancel and the abandoned sweep** call `credit.releaseReservation`, which
  resolves the row to `Released` in ONE statement and adds the money back.
  `cancelPendingSale` is now four lines; the `used_funds` / `reserved_funds`
  read it used (`orders.findReservedFunds`, `sql/find_reserved_funds.sql`, the
  `ReservedFunds` contract) is deleted.
- **The settled path** calls `credit.settleReservation`, which resolves the same
  row to `Debit` and moves no money. It runs in all three places a sale settles:
  at placement when nothing is owed or Stripe has already taken it
  (`rules.settlesAtPlacement`, the payment fact `statusAtPlacement` is derived
  from - not the label, per D211), in the webhook's advance, and in the settled
  sweep's advance.

Because the resolution is one conditional UPDATE, a second release matches
nothing, a released reservation cannot then be settled, and a settled one cannot
be returned.

**Tests**: `transactions/credit/tests/funds.test.ts` - four tests covering the
whole life of a reservation, replacing the pinned *"a debit is immediate and
records nothing"*. `transactions/tests/sweeps.test.ts` - the abandonment sweep
returns the reservation and leaves exactly one `Released` row; the settled sweep
converts it to `Debit`. `orders/tests/place-sale.test.ts` - a placed sale's
credit is one ledger row for exactly `totals.funds`.

**One transition note.** Orders placed before this lane carry a `Debit` row (or
none) rather than a `Reserve`, so their credit is not returned by the new path.
Dev only; production has never run any of this.

### Ruling 89 - HOLD_AT_LOCATION stays, and the destination is a row

**Migration 139** adds `default_return boolean` and `carrier_location_code text`
to `places.locations`, with a partial unique index so **exactly one** row can be
the default, and marks the `FEDEX_OFFICE` row - which already carried the
address, the label company name and the label phone number that were duplicated
in TypeScript - with `carrier_location_code = 'ADSK'`. `scripts/dump-seed.mjs`
carried both columns into `047_seed_reference_data.sql`, so a from-nothing build
has it.

`providers/shipments/constants.ts` no longer holds `FEDEX_STORE_ADDRESS` or
`DEFAULT_HOLD_AT_LOCATION_DETAIL`, and `createShipmentPayload` no longer
defaults `holdAtLocation` to true. `db/places/locations/repo.ts defaultReturn()`
is one SQL read parsed through a new `HoldAtLocation` contract;
`logistics/shipping/labels.ts` reads it and hands it to
`requests.inboundLabelRequest` and `requests.returnLabelRequest`, and the FedEx
adapter shapes it into `specialServiceTypes` + `holdAtLocationDetail`.
`operations/service.ts quoteRate` reads the same row for the inbound leg's
recipient. Nothing about the business's own location is written in code any
more.

**Tests**: `providers/shipments/tests/payloads.test.ts` - the payload's location
id, location type, street lines, postcode, company name and phone all come from
the row the caller supplied; **no hold location, no hold service** (nothing is
defaulted in the adapter); the inbound leg travels to the same row's address.
`db/places/locations/tests/repo.test.ts` - the default exists and carries what a
label needs, a second default is refused by the index, and a default with no
carrier code answers nothing rather than a payload naming nowhere. The recorded
FedEx cassette now supplies the same hold values it was recorded with, so the
replay still matches.

### Ruling 90 - the cache stays; a ban, a revocation and a demotion bite at once

**Mechanism, and why.** better-auth 1.6.9 answers `getSession` from the signed
session-data COOKIE when `cookieCache` is on, with no database read
(`dist/api/routes/session.mjs`), and the admin plugin checks `banned` only in a
`session.create.before` hook - at sign-in. So `revokeSession` deletes a row the
request is no longer consulting, and `cookieCache.version` is called with the
cached session, so it cannot see the database either. `disableCookieCache` would
switch the cache off, which the ruling forbids. Immediacy therefore comes from
one server-side fact.

`db/auth/sessions/repo.ts freshnessOf(session_id)` is a single statement -
`auth.sessions` joined to `auth.users` on the session's primary key. No row
means revoked. `accounts/auth/rules.ts` turns it into a verdict
(`revoked` / `banned` / `live`, with an elapsed `banExpires` read as live) and
an authoritative role. `accounts/auth/session.ts` exports `sessions.current`,
which composes them, and `shared/middleware/authMiddleware.ts` calls it: revoked
is 401, banned is 403, and `requireRole` reads the DATABASE's role, so a
demotion from admin bites on the next request. The seam is a plain object
because `shared/testing/session.ts` patches `current` - its public API is
unchanged, so all 72 `mockSessions` consumers keep working.

**Tests**: unit tests for the verdict and the role; a database test per trigger
(delete the session row; set `banned`; change the role) driving the real seam
against real `auth.*` rows; and the pinned *"UNDECIDED"* test in
`accounts/auth/tests/config-options.test.ts` rewritten to assert the ruled
behaviour - the cache is still on and still five minutes, AND the middleware
consults ban state and role freshness.

---

## Every pin fails before the fix

- **Ruling 87 measured directly.** The six sales-tax files were reverted to the
  tip of dev and the suite re-run: *"a state that has not reached nexus is
  charged no tax, and one that has is"* and *"volume is recorded in every state;
  money is owed only where nexus is reached"* both fail, and the four older
  tests in that file pass. Restored, all six pass.
- **The builder's colliding tracking numbers were measured at the tip of dev,
  before this lane changed anything**: two tests in
  `shared/middleware/tests/ownership.test.ts` failed on
  `shipments_tracking_number_unique`. They pass now.
- **Finding 33's widened rule failed against real code on its first run** -
  `getTracking` calling FedEx inside a transaction - and passes now that the
  call is outside it. That is the before/after in one step.
- **Findings 38, 35 and the freshness triggers** were each captured failing
  first, by writing the test before the change (finding 38: `400.5`, `'nope'`,
  `{}`, and a carrier 401/403 answered as this API's own) and by temporarily
  restoring the old middleware (ruling 90's three triggers).
- The remaining pins **cannot** pass against the old tree by construction: they
  name a column, a contract or a function that did not exist -
  `tax.sales_tax.sales_volume`, a `Reserve` ledger row, `HoldAtLocation`,
  `claimOwner`, `shipments_shipper_address_theirs_fk`, `returnLeg` on the
  cancel. Four of them are the inverse evidence, having failed the moment the
  source changed and before the test was updated: `patch.test.ts`'s cancel,
  `adopt.test.ts`'s two adoption results, and `sweeps.test.ts`'s refund.

## Gate

`pnpm check` from the repo root, green except the pre-existing
`figma:inventory` (12 findings in `packages/components` / `scripts/figma/`,
Jacob's, untouched here).

Three ACCEPTED maps moved, each because a finding was fixed or a file was added,
never to make a count pass: `lint:domain-boundaries` `domains/orders/service.ts`
10 -> 9 (the cancel stopped naming a shipment column),
`lint:no-literal-views` `domains/transactions/sweeps.ts` 2 -> 1
(`cancelPendingSale` lost its branch) plus a new entry for ruling 90's session
seam, and `audit:silent-mutations` lost its `tax.accrue` excuse because the
accrual is now observed. That audit is back at its ceiling of 14: the three
calls this lane added (`shipments.claimOwner`, `pickups.claimOwner`, and the
credit return's `adjustCredit`) are all asserted rather than dropped.
