-- A create and an edit both take the patch (ruling 61); the column defaults
-- decide what a create may leave out. The audit columns are the trigger's.
INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, ask_amount, unit, reason,
                               expires_at, expires_at_market_open, enabled)
SELECT $1, $2,
       COALESCE($3::numeric, 0),
       COALESCE($4::numeric, 0),
       COALESCE($5::text, 'percent'),
       COALESCE($6::text, ''),
       $7::timestamptz,
       COALESCE($8::boolean, false),
       COALESCE($9::boolean, true)
RETURNING metal_id
