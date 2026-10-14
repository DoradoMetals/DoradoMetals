-- The Spots page and the public ticker in one read: every metal's card, and
-- `paused`, the stale metals the pricing-paused banner names.
WITH t AS (
  SELECT m.sort_order,
         jsonb_build_object(
           'id', r.metal_id,
           'ask', r.ask,
           'bid', r.bid,
           'last_ask', r.last_ask,
           'last_bid', r.last_bid,
           'percent_change', r.percent_change,
           'dollar_change', r.dollar_change,
           'bid_dollar_change', r.bid_dollar_change,
           'bid_percent_change', r.bid_percent_change,
           'ask_dollar_change', r.ask_dollar_change,
           'ask_percent_change', r.ask_percent_change,
           'updated_at', r.updated_at,
           'last_tick_at', r.last_tick_at,
           'state', r.state,
           'direction', CASE WHEN COALESCE(r.dollar_change, 0) = 0 THEN 'flat'
                             WHEN r.dollar_change > 0 THEN 'up'
                             ELSE 'down' END) AS card,
         r.metal_id,
         r.state
    FROM spots.resolved r
    JOIN metals.metals m ON m.id = r.metal_id
)
SELECT jsonb_build_object(
         'spots', COALESCE((SELECT jsonb_agg(t.card ORDER BY t.sort_order, t.metal_id) FROM t),
                           '[]'::jsonb),
         'paused', COALESCE((SELECT jsonb_agg(t.metal_id ORDER BY t.sort_order, t.metal_id)
                               FROM t WHERE t.state = 'stale'), '[]'::jsonb)) AS board
