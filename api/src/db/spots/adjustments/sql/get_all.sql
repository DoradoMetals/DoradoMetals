-- `scope` is one derived label per pair (audit section 2d): Active when this
-- source is the metal's active one, Dormant when the row is stored and waiting.
-- `expires_at_resolved` is the instant the row actually lapses, recomputed from
-- the market calendar when the intent is "at market open" so a holiday added
-- later moves it.
SELECT a.metal_id,
       a.source_id,
       a.bid_amount,
       a.ask_amount,
       a.unit,
       a.reason,
       a.expires_at,
       a.expires_at_market_open,
       a.enabled,
       a.created_at,
       a.updated_at,
       a.created_by,
       a.updated_by,
       a.created_by_id,
       a.updated_by_id,
       CASE WHEN act.metal_id IS NULL THEN 'Dormant' ELSE 'Active' END AS scope,
       CASE WHEN a.expires_at_market_open THEN spots.next_market_open(a.updated_at)
            ELSE a.expires_at END AS expires_at_resolved
  FROM spots.adjustments a
  JOIN metals.metals m ON m.id = a.metal_id
  LEFT JOIN spots.active_sources act
         ON act.metal_id = a.metal_id AND act.source_id = a.source_id
 ORDER BY m.sort_order ASC, a.metal_id ASC, a.source_id ASC
