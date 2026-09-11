UPDATE media.emails
   SET complained_at = coalesce(complained_at, $2::timestamptz)
 WHERE id = $1
RETURNING id
