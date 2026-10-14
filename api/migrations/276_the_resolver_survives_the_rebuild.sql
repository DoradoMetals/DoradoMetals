-- runs-even-under-a-baseline: 269 carries rows, so a baseline replays its DDL
--   too, and its CREATE OR REPLACE VIEW puts back the spots.spots resolver that
--   nulls a stale price. 275 is pure DDL and is stamped, so this restates 275's
--   view after 269 on every rebuilt database.
--
-- THE RESOLVER MIGRATION 275 WROTE, RESTATED SO A REBUILD ENDS ON IT.
--
-- verify:replay found it: genesis holds 275's spots.resolved, 269 replays
-- and overwrites it, and 275 never runs again. The body below is 275's,
-- unchanged; read 275 for what it says.
--
-- spots.candles also gains an access path that leads with the metal, for the
-- chart read (db/spots/candles/sql/list.sql), which audit:query-paths asked
-- for.
--
-- `exchange` is neither read nor written.

CREATE INDEX IF NOT EXISTS candles_metal_id_interval_bucket_start_idx
  ON spots.candles (metal_id, interval, bucket_start);

CREATE OR REPLACE VIEW spots.resolved AS
SELECT m.id AS metal_id,
       q.source_id,
       q.bid AS feed_bid,
       q.ask AS feed_ask,
       p.bid,
       p.ask,
       q.percent_change,
       q.dollar_change,
       q.dollar_change AS bid_dollar_change,
       CASE WHEN q.bid - q.dollar_change = 0 THEN NULL
            ELSE q.dollar_change / (q.bid - q.dollar_change) * 100 END AS bid_percent_change,
       q.dollar_change AS ask_dollar_change,
       CASE WHEN q.ask - q.dollar_change = 0 THEN NULL
            ELSE q.dollar_change / (q.ask - q.dollar_change) * 100 END AS ask_percent_change,
       q.at AS updated_at,
       st.state,
       q.seen_at AS last_tick_at,
       p.bid AS last_bid,
       p.ask AS last_ask,
       CASE WHEN frz.metal_id IS NOT NULL THEN 'freeze'
            WHEN adj.metal_id IS NOT NULL THEN 'adjust' END AS mode,
       a.source_id IS NULL AS follows_default
  FROM metals.metals m
  LEFT JOIN LATERAL (
         SELECT make_interval(secs => ss.stale_after_seconds) AS stale_after
           FROM spots.settings ss
          LIMIT 1) cfg ON TRUE
  LEFT JOIN spots.active_sources a ON a.metal_id = m.id
  LEFT JOIN LATERAL (
         SELECT c.source_id, c.bid, c.ask, c.dollar_change, c.percent_change, c.at, c.seen_at
           FROM spots.sources x
           JOIN spots.current c ON c.source_id = x.id AND c.metal_id = m.id
          WHERE x.enabled
            AND (x.id = a.source_id
                 OR x.is_default
                 OR c.seen_at >= now() - cfg.stale_after)
          ORDER BY COALESCE(x.id = a.source_id, false) DESC,
                   x.is_default DESC,
                   x.sort_order ASC,
                   x.id ASC
          LIMIT 1) q ON TRUE
  LEFT JOIN spots.adjustments adj
         ON adj.metal_id = m.id
        AND adj.source_id = q.source_id
        AND adj.mode = 'adjust'
        AND (adj.expires_at IS NULL OR adj.expires_at > now())
        AND (NOT adj.expires_at_market_open
             OR COALESCE(spots.next_market_open(adj.updated_at), 'infinity'::timestamptz) > now())
  LEFT JOIN LATERAL (
         SELECT f.metal_id, f.frozen_bid, f.frozen_ask
           FROM spots.adjustments f
          WHERE f.metal_id = m.id
            AND f.mode = 'freeze'
            AND (f.expires_at IS NULL OR f.expires_at > now())
            AND (NOT f.expires_at_market_open
                 OR COALESCE(spots.next_market_open(f.updated_at), 'infinity'::timestamptz) > now())
          ORDER BY f.updated_at DESC, f.source_id ASC
          LIMIT 1) frz ON TRUE
  CROSS JOIN LATERAL (
         SELECT CASE WHEN frz.metal_id IS NOT NULL THEN frz.frozen_bid
                     WHEN adj.metal_id IS NULL THEN q.bid
                     WHEN adj.unit = 'dollars' THEN q.bid + adj.bid_amount
                     ELSE q.bid * (1 + adj.bid_amount / 100) END AS bid,
                CASE WHEN frz.metal_id IS NOT NULL THEN frz.frozen_ask
                     WHEN adj.metal_id IS NULL THEN q.ask
                     WHEN adj.unit = 'dollars' THEN q.ask + adj.ask_amount
                     ELSE q.ask * (1 + adj.ask_amount / 100) END AS ask) p
  CROSS JOIN LATERAL (
         SELECT CASE WHEN frz.metal_id IS NOT NULL THEN 'frozen'
                     WHEN q.source_id IS NULL THEN 'stale'
                     WHEN q.seen_at < now() - cfg.stale_after THEN 'stale'
                     ELSE 'live' END AS state) st;
