-- A create and an edit both take the patch (ruling 61); the column defaults
-- decide what a create may leave out. A freeze that names no pair is given
-- the metal's last resolved one by spots.hold_frozen_pair, not here.
INSERT INTO spots.adjustments (metal_id, source_id, mode, bid_amount, ask_amount, unit,
                               frozen_bid, frozen_ask, reason, expires_at,
                               expires_at_market_open)
SELECT $1, $2,
       COALESCE($3::text, 'adjust'),
       COALESCE($4::numeric, 0),
       COALESCE($5::numeric, 0),
       COALESCE($6::text, 'percent'),
       $7::numeric,
       $8::numeric,
       COALESCE($9::text, ''),
       $10::timestamptz,
       COALESCE($11::boolean, false)
RETURNING metal_id
