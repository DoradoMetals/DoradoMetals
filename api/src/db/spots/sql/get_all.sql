-- The resolver per metal, in the metal's own order. `bid` and `ask` are NULL
-- while a metal is stale (migration 269); `last_bid` / `last_ask` are what the
-- card shows beside its stale badge.
SELECT r.metal_id AS id,
       r.ask,
       r.bid,
       r.last_ask,
       r.last_bid,
       r.percent_change,
       r.dollar_change,
       r.bid_dollar_change,
       r.bid_percent_change,
       r.ask_dollar_change,
       r.ask_percent_change,
       r.updated_at,
       r.last_tick_at,
       r.state
  FROM spots.resolved r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.sort_order ASC, r.metal_id ASC
