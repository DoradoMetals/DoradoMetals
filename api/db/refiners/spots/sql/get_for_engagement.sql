-- The refinery's quoted spots for one ENGAGEMENT, as verbatim table rows: every column of refiners.spots, nothing joined on. The metal arrives as its id.
-- The metals join exists ONLY for the stable by-name ordering every spots read uses; it contributes no column.
SELECT sp.id, sp.metal_id, sp.refiner_id, sp.order_id, sp.pool_oz_deducted,
       sp.ask, sp.bid, sp.scrap_percentage, sp.bullion_percentage,
       sp.created_at, sp.updated_at, sp.refiner_order_id
  FROM refiners.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.refiner_order_id = $1
 ORDER BY m.name ASC, sp.id ASC
