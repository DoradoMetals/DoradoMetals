SELECT to_jsonb(o)
       || jsonb_build_object(
            'created_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'cancelled_at', to_char(o.cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'totals',
              (SELECT to_jsonb(t)
                      || jsonb_build_object(
                           'created_at', to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                           'updated_at', to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                 FROM orders.transactions t
                WHERE t.order_id = o.id),
            -- Shared with view.sql via order_reference.sql so the two cannot drift.
            'reference', /*__order_reference__*/,
            'state', /*__order_state__*/,
            'customer',
              (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email)
                 FROM auth.users u
                WHERE u.id = o.user_id)) AS view
  FROM orders.orders o
 WHERE ($1::orders.direction IS NULL OR o.direction = $1::orders.direction)
   AND ($2::uuid IS NULL OR o.user_id = $2::uuid)
 ORDER BY o.created_at DESC, o.id DESC
