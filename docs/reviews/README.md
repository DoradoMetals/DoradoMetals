# API review, 2026-09-07: 63 findings, 55 unique

Four reviewers, findings only, every one proven with an input and a wrong
output (most reproduced on the local test database or the rebuilt
production copy). Full detail per area: `money-path.md` (MP),
`money-and-identity.md` (MI), `logistics-and-documents.md` (LD),
`machinery.md` (MA). Duplicates are listed once with every source.

## Tier 1: fix before anything else

| # | finding | sources |
|---|---|---|
| 1 | Any customer reads any shipment via `?shipment_id=<own>` on `GET /shipments/:id` | MI F1, MA F1 |
| 2 | Any customer downloads any order's invoice / packing lists | LD F1 |
| 3 | A customer can point their parcel at any address row (128 dropped 123's ownership FK) | LD F2 |
| 4 | Confirming a bullion line re-derives content as post_melt x purity: purity applied twice, 8-10% of the metal lost | MP F1 |
| 5 | Customer credit spent with no lock and no floor: balance goes negative | MP F7, MI F3 |
| 6 | `add_funds` not idempotent: every admin click credits again | MP F4, MI F2 |
| 7 | The checkout accepts any payment method id; the quote reads surcharge/fee off it (credit id, card charged, no surcharge; WIRE fee waived) | MP F2 |
| 8 | Sales tax collected where nexus is false and accrued nowhere | MP F3 |
| 9 | Gram and pound conversion constants wrong in JS and SQL | MA F10 |
| 10 | `fineContent` throws on NULL unit, values an unknown unit at zero | MA F4 |
| 11 | Nothing compares Stripe's amount to the order total before marking paid | MI F7 |
| 12 | Label can be bought twice; a bought label may never be recorded | LD F5 |
| 13 | A cancel links a second shipment to the fulfillment; "the parcel" reads pick one at random; pickup/appointment orders cannot be cancelled | LD F3, LD F4 |
| 14 | `set_password` mints a credential from a session alone | MI F14 |
| 15 | Seed script plants a hardcoded admin password into whatever DATABASE_URL names; env.ts defaults DATABASE_URL to dev | MA F9, MA F8 |

## Tier 2: data and rules

| # | finding | sources |
|---|---|---|
| 16 | Anonymous sweep stops forever on one visitor with an intent (4 of 11 FK tables cleared) | MI F9, MA F2 |
| 17 | Settled-intents sweep advances orders with no guard, lock or transaction; every cron runs once at boot; the refund half is never scheduled; the abandoned-sale sweep has no caller and no status filter | MP F11, MA F5, MA F6, MA F7, MP F8, MI F15 |
| 18 | Refiner money written outside a transaction in up to seven statements | MP F6 |
| 19 | Admin fulfillment writes outside a transaction, no actor stamped | LD F14 |
| 20 | `organizations.update` and carrier edits null every field not sent | MA F3, LD F18 |
| 21 | Stripe idempotency key outlives its intent: second checkout in a session breaks; typeless call mints a live intent then 500s; `find_reusable` never matches null type | MI F5, MI F6, MI F10 |
| 22 | `payments.intents.details_id` / `method_id` never written | MI F12 |
| 23 | Confirmation email lost on webhook retry; email trail records successes only | MI F11, LD F17 |
| 24 | Purchase cancelled before finalize returns metal uninsured; one NULL `max_insured_value` drops every label's insurance to zero | MP F5, LD F19 |
| 25 | Shipping charge re-quoted with a pickup type the checkout never sent; a sale can be placed with no delivery service (charge zero) | LD F6, LD F7 |
| 26 | Purchase invoice deducts the return leg but its total does not; sales invoice omits tax | LD F8, LD F9 |
| 27 | Buyers get a purchase-order packing list telling them to ship to Dorado; packing list prints a fabricated pickup slot | LD F10, LD F11 |
| 28 | Credit debited at placement, refunded only by a manual script (interacts with ruling 85) | MI F4 |
| 29 | Purchase quote has no `unpriceable`: a metal with no bid quotes $0 | MP F9 |
| 30 | `orders.spots.ask` frozen at placement, never refreshed: documents print two days | MP F10 |
| 31 | `finalizePricing` does not enforce the rule that gates it | MP F12 |
| 32 | Every return label bought HOLD_AT_LOCATION at the business's own FedEx Office | LD F12 |
| 33 | The transaction-side-effects gate cannot see any carrier call | LD F13 |
| 34 | `cancelPickup` sends a UTC-derived date for a local slot | LD F15 |
| 35 | Ban / revoked session / role change keeps working five minutes | MI F8 |
| 36 | Public reviews endpoint discloses staff author ids | LD F20 |
| 37 | `display = false` does not gate the sell-side list (incl. two corrupt-type rows) | LD F21 |
| 38 | Upstream carrier HTTP status becomes the API's own status | MA F11 |
| 39 | Four intent lookups `LIMIT 1` on an ordering that cannot break ties; address book in arbitrary order | MA F12, MA F14 |
| 40 | `withTransaction` can replace the real failure with the rollback's | MA F15 |
| 41 | `ShipmentPatch.carrier_id` required then discarded; `MediaUploadBody.mime_type` optional on a NOT NULL column | LD F16, MI F13 |
| 42 | `metals.convert_to_troy_oz` has no caller and its test certifies a divergence | MA F13 |

## The ledger: where every finding ended up

All four fix lanes are merged. `fixes-money-path.md` (lane A),
`fixes-money-and-identity.md` (lane B), `fixes-logistics-and-documents.md`
(lane C) and `fixes-closing.md` (lane D - the cross-lane hand-offs and rulings
87-90) say what changed and which test pins it. Nothing below is outstanding
work unless it says LEFT.

| # | status | where |
|---|---|---|
| 1 | FIXED | B - the guard checks every shipment a request names |
| 2 | FIXED | C - `assertEntitled` gates the whole of `serve.ts`, and answers 404 |
| 3 | FIXED | C (the rule) + D (the composite key, 137 + 140) |
| 4 | FIXED | A - fine content has one owner per kind of line, derived in SQL |
| 5 | FIXED | A (locked re-read + Conflict) + B (the floor) + 134/135 (the CHECK) |
| 6 | FIXED | A - `assertNotAlreadyCredited` on the transaction that writes the row |
| 7 | FIXED | A - `assertSettlementMethod`, and both quotes read only a valid method |
| 8 | FIXED | D - ruling 87: collect where nexus is reached, count volume everywhere (138) |
| 9 | FIXED | A - `metals.fine_content`, 31.1034768 g and 175/12 t oz |
| 10 | FIXED | A - an unknown unit raises, and refuses at the domain edge as a 422 |
| 11 | FIXED | B - `settlementCovers` in the webhook and the settled sweep |
| 12 | FIXED | C (the claim, the index, the second-cancel refusal) + D (cancel calls it) |
| 13 | FIXED | C (`returnLeg`, the parcel is never the return leg) + D (cancel calls it) |
| 14 | FIXED | B - session freshness, then `revokeOtherSessions` |
| 15 | FIXED | B - `assertSafeDatabase`, and env.ts stops filling DATABASE_URL in |
| 16 | FIXED | B - a blocked visitor is skipped, not a full stop |
| 17 | MOSTLY FIXED | B - no boot runs, the refund half is scheduled, the advance is guarded and locked. **LEFT**: a multi-instance advisory lock (out of proportion; the guarded advance is safe to run twice), and MI F15's status filter, deliberately not added - it contradicts D211. **Jacob's**: `PAYMENT_RECONCILE_SCHEDULE` is still absent from `api/.env`, so the job does not run |
| 18 | FIXED | A - one transaction around each refiner money edit |
| 19 | FIXED | C - every admin fulfillment write is in a transaction and stamped |
| 20 | FIXED | C - `buildUpdate` on both, and `carriers/sql/update.sql` is deleted |
| 21 | FIXED | B - the key carries an ordinal from a database fact; `type` is required |
| 22 | FIXED | B - the instrument links back to its intent in the same transaction |
| 23 | FIXED | B (the send is driven by `emails.hasSent`) + C (a failed send is a row) |
| 24 | FIXED | C (the NULL ceiling, `returnDeclaredValue`) + D (cancel calls it) |
| 25 | FIXED | C - the quote asks FedEx the fulfillment's own handoff; an Outbound leg owes its service |
| 26 | FIXED | C - the invoice deducts `pricing.shipping_charge`; the sales invoice prints its tax |
| 27 | FIXED | C - a sale is emailed its own invoice; the packing list prints the real slot |
| 28 | FIXED | D - ruling 88: credit is reserved at placement, released by cancel and by the sweep, converted to a debit when it settles |
| 29 | FIXED | A - `unpriceable` on the purchase quote; a metal with no bid is a 422 |
| 30 | FIXED | A - `ask` moves with `bid` on lock, and one `applyLock` does both |
| 31 | FIXED | A - `assertAllLinesConfirmed` gates `finalizePricing` |
| 32 | FIXED | D - ruling 89: HOLD_AT_LOCATION stays, the destination is a `places.locations` row (139) |
| 33 | FIXED | D - the rule sees `shippingOps`/`shippingHandler`, has a self-test, and immediately caught a real carrier call inside a transaction (`getTracking`), now moved out |
| 34 | FIXED | C - the pickup's own date string is what is cancelled |
| 35 | FIXED | D - ruling 90: the cache stays; one freshness read makes a ban, a revocation and a demotion bite at once |
| 36 | FIXED | C - the public list drops the author columns and parses through `PublicReview` |
| 37 | PINNED BY RULING | ruling 49 - the sell side has no gate, on purpose. Both halves pinned in `catalog/products/tests/service.test.ts` |
| 38 | FIXED | D - an upstream failure answers 502, and `raised.status` is coerced |
| 39 | FIXED | B - every `LIMIT 1` orders on a tie-breaker; the address book is ordered |
| 40 | FIXED | B - a failing ROLLBACK no longer replaces the real error |
| 41 | FIXED | C (`carrier_id` dropped) + B (`mime_type` required) |
| 42 | FIXED | A - `metals.convert_to_troy_oz` is dropped, with the test that certified its divergence |

### What is LEFT, in one place

- **Finding 17**: a multi-instance advisory lock on the writing sweeps, and
  `PAYMENT_RECONCILE_SCHEDULE` in `api/.env` (Jacob's - the reconcile job does
  not run at all without it). `STALE_OFFERS_UPDATE_SCHEDULE` is still there
  reading into nothing.
- **Finding 12's last gap**: if `record()`'s transaction fails the label is
  bought and only the log knows the number. Voiding it needs a
  catch-compensate-rethrow in the cancel/place use cases.
- **Finding 23's residue**: two webhook deliveries arriving concurrently can
  both read "no confirmation yet" and both send.
- **`orders/place.ts`'s bare `await world.buyLabel(...)`** after the commit
  still throws out of `place()` on a carrier outage (lane C's note 2 to lane A).
- **CLAUDE.md's `audit:enum-domains` entry** calls the two corrupt-`type`
  products "not reachable today". They are reachable on the bid storefront.
  One sentence to correct, and the `btrim` itself is D39 - an UPDATE against
  production, which is Jacob's.
- **The orphan `exchange.schema_migrations` row** named
  `134_a_balance_cannot_go_below_zero.sql` on dev. Inert, and deliberately not
  deleted.

## Decisions that are Jacob's before the fix

- 8: charge tax only where `reached_nexus` (what accrual already assumes), or accrue everywhere. Recommendation: only where nexus is reached.
- 28 with ruling 85: reserve credit at placement, return it at expiry or cancel.
- 32: is HOLD_AT_LOCATION for return labels intended?
- 35: is a five-minute session cache acceptable, or must a ban bite at once?

Everything else is a bug with one correct answer and gets fixed.
