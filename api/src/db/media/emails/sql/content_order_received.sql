-- Order received (Figma 6:173). One read: who it goes to, which order, and the
-- summary card's rows. Direction-aware - a seller's card lists the metal lots
-- they declared and what the parcel is insured for; a buyer's lists what they
-- bought and what the order came to.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
scrap AS (
  SELECT i.metal_id AS label,
         trim(to_char(SUM(i.pre_melt), 'FM999,999,990.0')) || ' ' || i.unit AS value,
         SUM(i.pre_melt) AS weight
    FROM orders.lots ol
    JOIN inventory.lots i ON i.id = ol.lot_id
    JOIN ord ON ord.id = ol.order_id
   WHERE i.bullion_id IS NULL
     AND i.pre_melt IS NOT NULL
     AND ord.direction = 'purchase'
   GROUP BY i.metal_id, i.unit
),
bought AS (
  SELECT COALESCE(b.name, i.metal_id) AS label,
         i.quantity::bigint::text
           || CASE WHEN i.quantity = 1 THEN ' unit' ELSE ' units' END AS value,
         COALESCE(i.content, 0)
           * COALESCE(i.premium, 0)
           * COALESCE(CASE WHEN ord.direction = 'sale' THEN os.ask ELSE os.bid END,
                      CASE WHEN ord.direction = 'sale' THEN sp.ask ELSE sp.bid END,
                      0)
           * i.quantity AS weight
    FROM orders.lots ol
    JOIN inventory.lots i ON i.id = ol.lot_id
    JOIN ord ON ord.id = ol.order_id
    LEFT JOIN products.bullion b ON b.id = i.bullion_id
    LEFT JOIN orders.spots os ON os.order_id = ol.order_id AND os.metal_id = i.metal_id
    LEFT JOIN spots.spots sp ON sp.metal_id = i.metal_id
   WHERE i.bullion_id IS NOT NULL
),
lines AS (
  SELECT label, value, weight FROM scrap
   UNION ALL
  SELECT label, value, weight FROM bought
   ORDER BY weight DESC NULLS LAST
   LIMIT 2
),
tail AS (
  SELECT CASE WHEN ord.direction = 'sale' THEN 'Order total' ELSE 'Declared value' END AS label,
         COALESCE(
           '$' || to_char(
             CASE WHEN ord.direction = 'sale' THEN t.total ELSE s.declared_value END,
             'FM999,999,990.00'),
           '-') AS value
    FROM ord
    LEFT JOIN orders.transactions t ON t.order_id = ord.id
    LEFT JOIN LATERAL (
           SELECT sh.declared_value
             FROM shipping.shipments sh
             JOIN fulfillments.shipments fs ON fs.shipment_id = sh.id
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = ord.id AND sh.direction <> 'Return'
            ORDER BY sh.created_at ASC NULLS FIRST, sh.id ASC
            LIMIT 1
         ) s ON TRUE
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', ord.number,
         'direction', ord.direction::text,
         'rows',
         COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)
                                    ORDER BY weight DESC NULLS LAST)
                     FROM lines), '[]'::jsonb)
           || COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value))
                          FROM tail), '[]'::jsonb)
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
