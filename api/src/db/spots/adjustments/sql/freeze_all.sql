-- "Freeze all": every metal that has a source and is not already frozen gets
-- a freeze on its own source, holding its last resolved pair - filled in by
-- spots.hold_frozen_pair, so this statement copies no price. An adjust row on
-- that pair becomes the freeze; its amounts are kept for when it is edited
-- back to adjust.
INSERT INTO spots.adjustments (metal_id, source_id, mode, reason)
SELECT r.metal_id, r.source_id, 'freeze', $1
  FROM spots.resolved r
 WHERE r.source_id IS NOT NULL
   AND r.last_bid IS NOT NULL
   AND r.state <> 'frozen'
ON CONFLICT (metal_id, source_id) DO UPDATE
   SET mode = 'freeze',
       reason = EXCLUDED.reason,
       expires_at = NULL,
       expires_at_market_open = false
RETURNING metal_id
