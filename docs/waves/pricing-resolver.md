# Pricing resolver and spot sources (lane `pricing-resolver`, 2026-10-09)

Source: `docs/design/api-gaps-pricing.md` (the audit of the Pricing design
against `dev`). Jacob's model, in his words: "adjustments are per metal per
source, active source spot per metal." This wave gives that model storage and
fixes the one bug the audit found in money paths.

## Rulings that bind this lane

Every ruling in `docs/waves/leads-api.md` "Rulings that bind this lane"
applies here unchanged (facts as rows and timestamps, labels derived in SQL,
lookups not constants, PATCH for edits, only pricing prices, DB creates ids
and audit stamps, no comments in code, verify before dropping). Plus the
audit's §3 defaults, adopted as rulings for this lane:

- An adjustment is signed, with a `unit` column (`percent` default, `dollars`
  allowed), one row per (metal, source), stored and dormant when that source
  is not the metal's active one. No global default.
- The active source is per metal, not per side.
- Adjustments may expire at a fixed time or at market open; the market
  calendar is rows (`spots.market_sessions`, `spots.market_holidays`) seeded
  with the COMEX schedule, and the open instant is one SQL expression.
- A metal with no enabled source reads `stale` and pricing refuses to price
  it silently: the resolver returns null and the pricing rules raise.
- Lock states are `Unlocked · Locked · Finalized`; no new status word.
- Unlocking stays purchase-only until Jacob rules (audit §3 Q9); the actor of
  every lock and unlock is recorded.
- Sort order of metals is a column on `metals.metals`, not an array literal.

## Scope

1. **The resolver bug (audit §2a).** Build one SQL view `spots.resolved`
   (metal_id, bid, ask, source_id, adjusted bid/ask, percent/dollar changes,
   updated_at, state) that applies the metal's active source and its
   adjustment, and make every pricing statement join it: `purchase_quote`,
   `sale_quote`, `order_pricing`, `product_quote`, `profit_breakdown`, and
   `db/spots/sql/get_all.sql`. The feed job must keep writing an overridden
   metal (`pricing/spots/service.ts:38` skips it today). Prove with a test
   that an adjustment changes what an order pays.
2. **Sources.** `spots.sources (id text PK, enabled, sort_order, last_tick_at,
   last_attempt_at, last_error)` + audit, seeded with the one feed that
   exists (`nfusion`). `spots.active_sources (metal_id PK, source_id)`.
   Routes: `GET /api/spots/sources`, `PATCH /api/spots/sources/:id`,
   `PATCH /api/spots/metals/:metal_id/active-source`. Per-source tick
   stamped by the feed job. Status (`Live · Standby · Off`) is a SQL CASE.
3. **Adjustments.** `spots.adjustments (metal_id, source_id, bid_amount,
   ask_amount, unit, reason, expires_at, expires_at_market_open, enabled)` +
   audit, PK (metal_id, source_id). `GET /api/spots/adjustments`,
   `PATCH /api/spots/adjustments/:metal_id/:source_id`, `DELETE` same path.
   Migrate `spots.overrides` rows into it (absolute bid/ask become dollar
   adjustments against the feed at migration time, reason kept) and retire
   the `POST /api/spots/:metal_id/override` routes; `spots.overrides` stays
   until the data is verified (verify before dropping).
4. **Logs.** `spots.adjustment_history` fed by a trigger on
   `spots.adjustments` and on `spots.active_sources` (one table, nullable
   `source_id`, `field`, old/new, actor id and name, changed_at), modelled on
   `rates.rate_history` (migration 198); `GET /api/spots/adjustments/history`.
   Lock log: add `locked_by_id` / `unlocked_at` / `unlocked_by_id` facts to
   `orders.spots` (or an `orders.spot_lock_events` table if a lock can
   happen more than once per order; check and choose), and make
   `GET /api/spots/locks` return every lock event with its derived state, not
   only `spots_locked = true` rows.
5. **Small reads.** Per-side change columns on `spots.spots` written by the
   feed job (`bid_dollar_change`, `bid_percent_change`, ask pair); the
   adjustments list returns its audit columns; `POST /api/spots/refresh`
   (admin) runs the feed once; `stale_after_seconds` already lives in
   `spots.settings`, move the tick interval beside it; `sort_order` on
   `metals.metals`; a route for `metals.purity_labels`;
   `GET /api/rates/sheet.pdf` gets `requireAdmin`.

Out of scope: audit §3 Q11–Q12 (purity premiums, bid_premium) and anything on
the Rates page; they wait for Jacob.

## Mechanics

Lane worktree `/home/jtj60/dorado-lanes/pricing-resolver` (branch
`lane/pricing-resolver` off `dev`). Migrations are `api/migrations/240_*.sql`
onward (another lane holds 232–239). Never touch `api/.env`; never commit;
local Postgres on 127.0.0.1:5544 with a `test*` database; regenerate
contracts and genesis after migrating dev; `pnpm check:fast` and the full API
test suite green before reporting, outputs captured to files in the scratchpad
with `CHECK_EXIT` appended. Report counts, never customer rows.
