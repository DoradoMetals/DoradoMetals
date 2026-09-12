# Rates and Spots API (docs/design/rates-spots-screens.md)

Scope: the Spots and Rates "what the API must provide" tables, minus the
purity-label premium and the rate-preview endpoint, which the design itself
calls a proposal and not a read.

## Routes added

| route | guard | what it does |
|---|---|---|
| `GET /api/spots` | public | now returns `updated_at` and `source` (`live` \| `manual` \| `stale`) per metal, and reads the override pair when one is active |
| `GET /api/spots/locks` | admin | every order whose spots are locked - `order_id`, `reference`, `metal_id`, `bid`, `ask`, `locked_at`, `locked_by` |
| `POST /api/spots/:metal_id/override` | admin | `{ bid, ask, reason, expires_at? }` - creates or replaces the standing override for that metal |
| `DELETE /api/spots/:metal_id/override` | admin | removes the override; 404 if the metal carries none |
| `GET /api/spots/settings` | admin | the one `spots.settings` row |
| `PATCH /api/spots/settings` | admin | `{ stale_after_seconds }` |
| `GET /api/rates/history` | admin | every logged field change, newest first - `rate_id`, `field`, `old_value`, `new_value`, `actor_id`, `actor_name`, `changed_at` |

Unchanged: `GET/PUT /api/orders/:id/spots` (the per-order lock/unlock path)
and the full `rates.rates` CRUD (`GET/POST /api/rates`, `GET/PATCH/DELETE
/api/rates/:id`, `GET /api/rates/admin`, `GET /api/rates/tiers`).

## Migrations

- **`197_a_spot_knows_its_source.sql`** - `spots.settings` (singleton, `id
  boolean PRIMARY KEY DEFAULT true`, `stale_after_seconds int default 60`,
  ruling 116: the threshold is a row, not a constant) and `spots.overrides`
  (one row per metal: `bid`, `ask`, `reason`, `expires_at`, the audit_stamp
  trigger installed on it exactly as it is on `spots.spots`).
- **`198_a_rate_change_leaves_a_trail.sql`** - `rates.rate_history` (one row
  per changed column: `rate_id`, `field`, `old_value`, `new_value`,
  `actor_id`, `actor_name`, `changed_at`) and an `AFTER UPDATE` trigger
  (`rates.log_change`) that diffs `OLD`/`NEW` on `metal_id`, `unit`,
  `min_qty`, `max_qty`, `scrap_pct`, `bullion_pct` and inserts one row per
  field that actually changed. Fires after `audit_stamp`, so it reads the
  resolved `updated_by`/`updated_by_id` `audit_stamp` already wrote to `NEW`.

Both applied to dev (now at 198) and to the local test database via the
preflight auto-apply.

## Implementation notes

- `db/spots/sql/get_all.sql` computes `source` from `spots.overrides` (an
  unexpired row = `manual`) and from `spots.settings.stale_after_seconds`
  against `spots.spots.updated_at`, and `COALESCE`s the override's `bid`/`ask`
  over the feed's - an override has to change the number every price reads,
  not just a status label next to the old one (caught by a failing test:
  the first cut left the live bid in place under a `source: 'manual'` badge).
- `pricing/spots/service.updateSpotPrices` now skips any metal with a
  standing, unexpired override before writing a tick, so the feed cannot
  silently erase one.
- `GET /api/spots/locks` lives in `db/spots/locks/repo.ts`, reading
  `orders.orders` and `orders.spots` directly (the pattern `db/lots/items/sql/
  position.sql` already uses for `orders.lots`/`refining.lots`) and reusing
  `db/orders/sql/order_reference.sql` for the `PO-`/`SO-` reference, the same
  way `db/orders/repo.ts` reuses `db/fulfillments/repo.ts`'s `ARRIVED`
  fragment. `locked_at`/`locked_by` are `orders.orders.updated_at`/
  `updated_by`, not a new column on `orders.spots` - accurate because
  `applyLock` sets `spots_locked` in the same transaction as the lock/unlock,
  but it would drift if some other PATCH touched the order afterward without
  touching the lock. `orders.spots` carries no actor column at all today
  (the design doc flags this on the per-order Lock Row too); adding one is an
  `orders`-schema change, outside this lane.
- No live provider calls in any new or touched test: `#providers/nfusion/
  feed.ts` is `vi.mock`ed exactly as the existing spots tests already do.
- New tests sit with their subjects: `db/spots/overrides/tests`,
  `db/spots/settings/tests`, `db/spots/locks/tests`, plus additions to
  `pricing/spots/tests/{service,replay}.test.ts`, `pricing/rates/tests/
  replay.test.ts` and `db/rates/tests/repo.test.ts`. The six new admin routes
  are added to `accounts/authorization/admin-routes.json`.

## Two questions for Jacob (do not decide - evidence only)

1. **Is a premium ever per purity label, or always per metal and weight
   band?** `rates.rates` has no purity column at all; today a premium is
   `scrap_pct`/`bullion_pct` per `(metal_id, unit, min_qty, max_qty)` and
   purity only scales the fine content the premium multiplies (16 rows on
   dev, 4 bands per metal). The design's Rate Purity Row draws an editable
   per-purity premium as a proposal, not a read - `metals.purity_labels`
   carries no premium column and no route reads it that way.
2. **Which number prices a bullion purchase - `rates.rates.bullion_pct` or
   `products.bullion.bid_premium`?** They disagree in kind, not just value,
   and nothing reconciles them:
   - `db/pricing/sql/purchase_quote.sql` and `order_pricing.sql` (the actual
     checkout/order pricing for a purchase) price a bullion line with
     `band.bullion_pct` from `rates.rates`, retiered by the ORDER's total
     weight for that metal - `products.bullion.bid_premium` is never read on
     this path. 81 `orders.items` rows on dev carry a `bullion_id` today (90
     `orders.lots` rows on purchase orders), so this is the live path.
   - `db/pricing/sql/product_quote.sql` (`side = 'bid'`, the single-product
     quote) prices with `b.bid_premium` from `products.bullion` instead - no
     weight tier, one premium per catalog product. 62 `products.bullion` rows
     on dev; Gold alone carries 4 distinct `bid_premium` values across 22
     products, so it is not a restatement of the same four weight bands.

   A customer can therefore see one number quoted for a coin and be charged a
   different one for the same coin inside an actual purchase order. Neither
   system is touched here.
