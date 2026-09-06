-- Shipment received (Figma 154:881). The delivered scan, in the office's own
-- time zone, and the count of what arrived against what was sent.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
legs AS (
  SELECT sh.delivered_at, sh.id, sh.created_at
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
    JOIN shipping.shipments sh ON sh.id = fs.shipment_id
   WHERE sh.direction <> 'Return'
),
arrived AS (
  SELECT COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS in_hand,
         COUNT(*)                                        AS sent,
         MAX(delivered_at)                               AS at
    FROM legs
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', ord.number,
         'direction', ord.direction::text,
         'tracking_number', NULL,
         'rows', jsonb_build_array(
                   jsonb_build_object(
                     'label', 'Received',
                     'value', COALESCE(
                       to_char(arrived.at AT TIME ZONE 'America/Chicago', 'FMMon ')
                         || to_char(arrived.at AT TIME ZONE 'America/Chicago', 'FMDD') || ', '
                         || to_char(arrived.at AT TIME ZONE 'America/Chicago', 'FMHH12') || ':'
                         || to_char(arrived.at AT TIME ZONE 'America/Chicago', 'MI') || ' '
                         || to_char(arrived.at AT TIME ZONE 'America/Chicago', 'AM') || ' CT',
                       '-')),
                   jsonb_build_object(
                     'label', 'Parcels',
                     'value', arrived.in_hand::text || ' of ' || GREATEST(arrived.sent, 1)::text),
                   jsonb_build_object('label', 'Next step', 'value', 'Weighing and testing'))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  CROSS JOIN arrived
 -- Nothing has arrived, so there is nothing to announce. The gate is the read's,
 -- not the caller's: a trigger may fire on every tracking refresh and this
 -- answers with no row until a parcel is actually delivered.
 WHERE arrived.in_hand > 0
