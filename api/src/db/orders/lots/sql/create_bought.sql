-- Placement COPIES the basket's links onto the order and leaves the lot itself
-- alone, so its id is the same row the refiner will settle. The checkout links
-- are cleared afterwards, once the parcel has been priced off them.
INSERT INTO orders.lots (order_id, lot_id)
SELECT $1, cl.lot_id
  FROM checkout.lots cl
 WHERE cl.checkout_id = $2
 ORDER BY cl.created_at ASC, cl.id ASC
RETURNING id, order_id, lot_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
