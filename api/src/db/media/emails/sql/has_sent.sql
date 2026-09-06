SELECT EXISTS (
  SELECT 1
    FROM media.emails
   WHERE order_id = $1
     AND kind = ANY($2::media.email_kind[])
     AND status = 'sent'
) AS present
