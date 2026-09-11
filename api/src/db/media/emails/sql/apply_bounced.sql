-- A bounce wins over a delivery already recorded. The first bounce is the one
-- kept, so a replay changes nothing.
UPDATE media.emails
   SET bounced_at = coalesce(bounced_at, $2::timestamptz),
       bounce_reason = coalesce(bounce_reason, $3)
 WHERE id = $1
RETURNING id
