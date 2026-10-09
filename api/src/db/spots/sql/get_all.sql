-- The public ticker, over the RESOLVER and never over spots.spots: `bid` and
-- `ask` here are the active source's adjusted figures (migration 244), which
-- is what every priced statement now reads too.
SELECT r.metal_id AS id,
       r.ask,
       r.bid,
       r.percent_change,
       r.dollar_change,
       r.bid_dollar_change,
       r.bid_percent_change,
       r.ask_dollar_change,
       r.ask_percent_change,
       r.updated_at,
       r.state
  FROM spots.resolved r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.sort_order ASC, r.metal_id ASC
