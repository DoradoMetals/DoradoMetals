SELECT to_jsonb(a)
       || jsonb_build_object(
            'created_at', to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(a.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         AS address,
       jsonb_build_object(
         'address_id', ua.address_id,
         'user_id', ua.user_id,
         'recipient_name', ua.recipient_name,
         'label', ua.label,
         'default_shipping', ua.default_shipping) AS user_address,
       EXISTS (SELECT 1
                 FROM orders.orders o
                 JOIN orders.addresses oa ON oa.order_id = o.id
                WHERE oa.source_address_id = a.id
                  AND o.user_id = ua.user_id
                  AND o.status IS DISTINCT FROM 'Completed') AS locked
  FROM places.user_addresses ua
  JOIN places.addresses a ON a.id = ua.address_id
 WHERE ua.user_id = $1::uuid
   AND ($2::uuid IS NULL OR ua.address_id = $2::uuid)
 ORDER BY ua.default_shipping DESC, ua.recipient_name ASC NULLS FIRST, a.id ASC
