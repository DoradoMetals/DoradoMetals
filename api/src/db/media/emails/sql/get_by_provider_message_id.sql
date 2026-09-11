-- Locks the row before an order-tolerant delivery decision is made, so two
-- concurrent Resend callbacks for the same message cannot both read the
-- pre-update state and both decide to apply.
SELECT id, kind, status, to_address, subject, order_id, user_id, pdf_id,
       provider_message_id, error, sent_at,
       delivered_at, bounced_at, bounce_reason, complained_at
  FROM media.emails
 WHERE provider_message_id = $1
 ORDER BY sent_at DESC
   FOR UPDATE
