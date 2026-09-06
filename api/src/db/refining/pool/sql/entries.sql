SELECT id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
       to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       created_by_id
  FROM refining.pool
 WHERE ($1::uuid IS NULL OR refiner_id = $1::uuid)
   AND ($2::text IS NULL OR metal_id = $2::text)
 ORDER BY occurred_at DESC, id DESC
