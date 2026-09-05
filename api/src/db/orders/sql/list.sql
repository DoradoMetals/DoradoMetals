SELECT o.id, o.user_id, o.direction, o.status, o.number, o.notes, o.review_created,
       o.created_by, o.updated_by, o.created_at, o.updated_at,
       o.created_by_id, o.updated_by_id, o.order_sent, o.tracking_updated, o.spots_locked,
       (SELECT to_jsonb(t)
               || jsonb_build_object(
                    'created_at', to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'updated_at', to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM orders.transactions t
         WHERE t.order_id = o.id) AS totals
  FROM orders.orders o
 WHERE ($1::orders.direction IS NULL OR o.direction = $1::orders.direction)
   AND ($2::uuid IS NULL OR o.user_id = $2::uuid)
 ORDER BY o.created_at DESC, o.id DESC
