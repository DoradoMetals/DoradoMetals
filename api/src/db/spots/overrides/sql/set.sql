INSERT INTO spots.overrides (metal_id, bid, ask, reason, expires_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (metal_id) DO UPDATE
   SET bid = EXCLUDED.bid,
       ask = EXCLUDED.ask,
       reason = EXCLUDED.reason,
       expires_at = EXCLUDED.expires_at
RETURNING metal_id, bid, ask, reason, expires_at
