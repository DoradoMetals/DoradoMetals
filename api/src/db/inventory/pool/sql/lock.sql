-- Metal comes back out of the pool at an agreed price. troy_oz is stored
-- negative, so a balance is sum(troy_oz) and nothing has to know the entry
-- types to add them up; the cash value is -troy_oz * lock_price and is
-- derived. `purpose` says why the metal left (selling to a refiner or
-- sourcing a sale); `lot_id` names the sale lot it sources, when that is
-- the purpose. `refining_order_id` is no longer required - a lock that
-- sources a sale need not cite one.
INSERT INTO inventory.pool (refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
                             purpose, lot_id)
VALUES ($1, $2, 'lock', -abs($3::numeric), $4, $5, $6::inventory.lock_purpose, $7)
RETURNING id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
          to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          created_by_id, purpose, lot_id
