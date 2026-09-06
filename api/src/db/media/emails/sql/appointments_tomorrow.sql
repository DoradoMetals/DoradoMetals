-- Every appointment whose start falls on TOMORROW in the office's own time
-- zone, and which has not already had its reminder sent. The trail is the
-- idempotency: a second run on the same day selects nothing, because the row
-- filed by the first run is what this NOT EXISTS looks for. A calendar day is
-- computed in America/Chicago and not in UTC - a 7pm CT appointment is a
-- different UTC day, and reminding the customer two days out or not at all is
-- the bug that comes of getting that wrong.
SELECT f.order_id AS order_id
  FROM fulfillments.directs d
  JOIN fulfillments.fulfillments f ON f.id = d.fulfillment_id
 WHERE d.is_appointment
   AND d.start_time IS NOT NULL
   AND f.order_id IS NOT NULL
   AND (d.start_time AT TIME ZONE 'America/Chicago')::date
       = ((now() AT TIME ZONE 'America/Chicago')::date + 1)
   AND NOT EXISTS (
         SELECT 1 FROM media.emails e
          WHERE e.order_id = f.order_id
            AND e.kind = 'appointment_tomorrow'
            AND e.status = 'sent')
 ORDER BY d.start_time ASC
