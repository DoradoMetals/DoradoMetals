SELECT c.id, c.user_id, c.direction, c.payment_method_id, c.payment_details_id,
       c.recipient_address_id, c.fulfillment_id,
       COALESCE(
         (SELECT jsonb_agg(
                   to_jsonb(li)
                   || jsonb_build_object(
                        'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   ORDER BY cl.created_at ASC, cl.id ASC)
            FROM checkout.lots cl
            JOIN inventory.lots li ON li.id = cl.lot_id
           WHERE cl.checkout_id = c.id),
         '[]'::jsonb) AS lots
  FROM checkout.checkouts c
 WHERE c.id = $1::uuid
