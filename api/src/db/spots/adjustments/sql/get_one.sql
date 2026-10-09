-- One pair, the same derived scope and resolved expiry as get_all.
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
 WHERE a.metal_id = $1 AND a.source_id = $2
