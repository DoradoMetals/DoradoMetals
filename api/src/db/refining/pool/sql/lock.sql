-- Metal comes back out of the pool at an agreed price. troy_oz is stored
-- negative, so a balance is sum(troy_oz) and nothing has to know the entry
-- types to add them up; the cash value is -troy_oz * lock_price and is derived.
INSERT INTO refining.pool (refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id)
VALUES ($1, $2, 'lock', -abs($3::numeric), $4, $5)
RETURNING id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
          to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          created_by_id
