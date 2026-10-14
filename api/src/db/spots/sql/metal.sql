-- One metal for the metal page: the resolved spot with its state, the source
-- it reads and whether that is the default, and the adjustment in force.
-- The adjustment in force is the freeze when there is one, else the adjust row
-- on the metal's own source - the same choice spots.resolved makes.
SELECT jsonb_build_object(
         'id', r.metal_id,
         'metal_id', r.metal_id,
         'ask', r.ask,
         'bid', r.bid,
         'last_ask', r.last_ask,
         'last_bid', r.last_bid,
         'feed_ask', r.feed_ask,
         'feed_bid', r.feed_bid,
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
                           ELSE 'down' END,
         'market_open', spots.market_is_open(),
         'next_market_open', spots.next_market_open(now()),
         'source_id', r.source_id,
         'follows_default', r.follows_default,
         'mode', r.mode,
         'adjustment', (
           SELECT to_jsonb(a)
             FROM (/*__adjustments__*/) a
            WHERE a.metal_id = r.metal_id
              AND a.mode = r.mode
              AND a.scope = 'Active'
              AND (a.expires_at_resolved IS NULL OR a.expires_at_resolved > now())
            ORDER BY a.updated_at DESC, a.source_id ASC
            LIMIT 1)) AS metal
  FROM spots.resolved r
 WHERE r.metal_id = $1
