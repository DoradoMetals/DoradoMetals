-- Metal comes back out of the pool at an agreed price. troy_oz is stored
-- negative, so a balance is sum(troy_oz) and nothing has to know the entry
-- types to add them up; the cash value is -troy_oz * lock_price and is
-- derived. `purpose` says why the metal left (selling to a refiner or
-- sourcing a sale); `lot_id` names the sale lot it sources, when that is
-- the purpose. `refining_order_id` is no longer required - a lock that
-- sources a sale need not cite one.
--
-- basis_spot snapshots the pool's own weighted-average credit spot for this
-- refiner and metal AT THIS MOMENT (ruling 123), so a later credit never
-- moves what this withdrawal's gain was measured against.
INSERT INTO inventory.pool (refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
                             purpose, lot_id, basis_spot)
VALUES ($1, $2, 'lock', -abs($3::numeric), $4, $5, $6::inventory.lock_purpose, $7,
        (SELECT sum(c.troy_oz * c.spot) / NULLIF(sum(c.troy_oz), 0)
           FROM inventory.pool c
          WHERE c.entry = 'credit' AND c.refiner_id = $1 AND c.metal_id = $2
            AND c.spot IS NOT NULL))
RETURNING id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
          to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          created_by_id, purpose, lot_id, spot, basis_spot
