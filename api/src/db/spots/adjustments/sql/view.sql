-- One adjustment row as every read returns it. `scope` is Active when the row
-- applies to the metal now - a freeze always does, an adjust row when its
-- source is the metal's own (spots.resolved.source_id) - and Dormant when it
-- is stored and waiting. `expires_at_resolved` is the instant the row lapses,
-- recomputed from the market calendar when the intent is "at market open".
SELECT a.metal_id,
       a.source_id,
       a.mode,
       a.bid_amount,
       a.ask_amount,
       a.unit,
       a.frozen_bid,
       a.frozen_ask,
       a.reason,
       a.expires_at,
       a.expires_at_market_open,
       a.created_at,
       a.updated_at,
       a.created_by,
       a.updated_by,
       a.created_by_id,
       a.updated_by_id,
       CASE WHEN a.mode = 'freeze' OR r.source_id = a.source_id THEN 'Active'
            ELSE 'Dormant' END AS scope,
       CASE WHEN a.expires_at_market_open THEN spots.next_market_open(a.updated_at)
            ELSE a.expires_at END AS expires_at_resolved,
       COALESCE(CASE WHEN a.expires_at_market_open THEN spots.next_market_open(a.updated_at)
                     ELSE a.expires_at END < now(), false) AS expired
  FROM spots.adjustments a
  LEFT JOIN spots.resolved r ON r.metal_id = a.metal_id
