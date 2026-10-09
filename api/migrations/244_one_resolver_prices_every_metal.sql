-- ONE RESOLVER, AND EVERY PRICE READS IT.
--
-- docs/waves/pricing-resolver.md item 1, from the Pricing audit
-- (docs/design/api-gaps-pricing.md section 2a, the finding that mattered most).
--
-- THE BUG. spots.overrides was read by exactly one statement in the codebase,
-- db/spots/sql/get_all.sql - the display read behind GET /api/spots. Every
-- statement that actually priced money joined spots.spots RAW:
-- purchase_quote.sql:20, sale_quote.sql:56, order_pricing.sql:27 and :42,
-- product_quote.sql:13, profit_breakdown.sql:63. Worse,
-- pricing/spots/service.ts:38 SKIPPED any metal carrying a standing override,
-- so the feed stopped writing that metal and the frozen pre-override tick was
-- what every customer was paid and charged. An admin could move the number on
-- their own screen and move nothing else.
--
-- THE FIX IS ONE VIEW. `bid` and `ask` here are the APPLIED figures, and the
-- raw tick is `feed_bid` / `feed_ask`. That naming is deliberate: a statement
-- that swaps `spots.spots s` for `spots.resolved s` and keeps writing `s.bid`
-- gets the adjusted number automatically, which is the only arrangement where
-- forgetting is not silently wrong.
--
-- A PERCENT AMOUNT IS IN PERCENT UNITS: 0.20 is 0.20%, so the factor is
-- 1 + amount / 100. Gold at 2411.20 back 0.20% resolves to 2406.38 and its ask
-- at 2412.80 up 0.20% to 2417.63, which are the figures the Figma
-- adjustment-active screen asserts.
--
-- A METAL WITH NO ENABLED SOURCE RESOLVES TO NULL AND READS `stale`
-- (section 3 answer 7). Pricing then refuses rather than quietly paying out
-- against a figure no feed stands behind: purchase_quote and sale_quote list
-- the line in `unpriceable` and pricing/rules.ts raises.
--
-- THE CHANGE COLUMNS PASS THROUGH UNADJUSTED. A day's move is the market's,
-- not the adjustment's.
--
-- THE ADJUSTMENT IS DORMANT unless it is enabled, unexpired, and - when it
-- expires at market open - the next market open after it was last written is
-- still ahead. spots.next_market_open recomputes that instant from the
-- calendar rows on every read, so a holiday added later moves it.
--
-- `exchange` is neither read nor written.

CREATE OR REPLACE VIEW spots.resolved AS
SELECT s.metal_id,
       src.id AS source_id,
       s.bid AS feed_bid,
       s.ask AS feed_ask,
       CASE WHEN src.id IS NULL THEN NULL
            WHEN adj.metal_id IS NULL THEN s.bid
            WHEN adj.unit = 'dollars' THEN s.bid + adj.bid_amount
            ELSE s.bid * (1 + adj.bid_amount / 100) END AS bid,
       CASE WHEN src.id IS NULL THEN NULL
            WHEN adj.metal_id IS NULL THEN s.ask
            WHEN adj.unit = 'dollars' THEN s.ask + adj.ask_amount
            ELSE s.ask * (1 + adj.ask_amount / 100) END AS ask,
       s.percent_change,
       s.dollar_change,
       s.bid_dollar_change,
       s.bid_percent_change,
       s.ask_dollar_change,
       s.ask_percent_change,
       s.updated_at,
       CASE WHEN src.id IS NULL THEN 'stale'
            WHEN adj.metal_id IS NOT NULL THEN 'manual'
            WHEN s.updated_at < now() - make_interval(secs =>
                   (SELECT st.stale_after_seconds FROM spots.settings st LIMIT 1))
              THEN 'stale'
            ELSE 'live' END AS state
  FROM spots.spots s
  LEFT JOIN spots.active_sources a ON a.metal_id = s.metal_id
  LEFT JOIN spots.sources src ON src.id = a.source_id AND src.enabled
  LEFT JOIN spots.adjustments adj
         ON adj.metal_id = s.metal_id
        AND adj.source_id = src.id
        AND adj.enabled
        AND (adj.expires_at IS NULL OR adj.expires_at > now())
        AND (NOT adj.expires_at_market_open
             OR COALESCE(spots.next_market_open(adj.updated_at), 'infinity'::timestamptz) > now());
