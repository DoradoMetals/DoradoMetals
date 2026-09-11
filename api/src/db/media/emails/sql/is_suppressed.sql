-- An address that bounced or complained stops receiving marketing mail. It
-- keeps receiving codes and order mail: a bounced sign-in code is a failure the
-- customer sees and reports, and an order the business cannot confirm is worse
-- than a complaint.
SELECT EXISTS (
  SELECT 1
    FROM media.emails
   WHERE to_address = $1
     AND (bounced_at IS NOT NULL OR complained_at IS NOT NULL)
) AS present
