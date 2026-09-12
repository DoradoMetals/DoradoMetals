SELECT id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
       to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       created_by_id, purpose, lot_id, spot, basis_spot,
       CASE WHEN entry = 'lock' AND basis_spot IS NOT NULL
            THEN abs(troy_oz) * (lock_price - basis_spot) END AS gain
  FROM inventory.pool
 WHERE ($1::uuid IS NULL OR refiner_id = $1::uuid)
   AND ($2::text IS NULL OR metal_id = $2::text)
   AND ($3::inventory.pool_entry IS NULL OR entry = $3::inventory.pool_entry)
 ORDER BY occurred_at DESC, id DESC
