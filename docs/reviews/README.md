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

## Decisions that are Jacob's before the fix

- 8: charge tax only where `reached_nexus` (what accrual already assumes), or accrue everywhere. Recommendation: only where nexus is reached.
- 28 with ruling 85: reserve credit at placement, return it at expiry or cancel.
- 32: is HOLD_AT_LOCATION for return labels intended?
- 35: is a five-minute session cache acceptable, or must a ban bite at once?

Everything else is a bug with one correct answer and gets fixed.
