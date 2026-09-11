-- A delivery that arrives after a bounce is ignored; a replay of the same
-- delivery changes nothing.
UPDATE media.emails
   SET delivered_at = coalesce(delivered_at, $2::timestamptz)
 WHERE id = $1
   AND bounced_at IS NULL
RETURNING id
