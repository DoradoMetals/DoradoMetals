SELECT c.id, c.user_id, c.direction, c.payment_method_id, c.payment_details_id,
       c.recipient_address_id, c.fulfillment_id,
       COALESCE(
         (SELECT jsonb_agg(
                   to_jsonb(i)
                   || jsonb_build_object(
                        'created_at', to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'updated_at', to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   ORDER BY i.created_at ASC, i.id ASC)
            FROM checkout.items i
           WHERE i.checkout_id = c.id),
         '[]'::jsonb) AS items
  FROM checkout.checkouts c
 WHERE c.id = $1::uuid
