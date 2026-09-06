-- Shipment sent (Figma 154:808). The handover leg only - a return label is not
-- something the customer is told their metals are moving under.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
leg AS (
  SELECT sh.tracking_number,
         sh.est_delivery,
         (SELECT cs.name FROM shipping.services cs WHERE cs.id = sh.carrier_service_id) AS service_name
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
    JOIN shipping.shipments sh ON sh.id = fs.shipment_id
   WHERE sh.direction <> 'Return'
     AND sh.tracking_number IS NOT NULL
     -- The mailer says the carrier HAS the parcel, so it waits for a scan.
     -- 'Label Created' is a label bought and nothing collected; a customer told
     -- their metals were on the move while the box was still on their table is
     -- the one thing this row must not do.
     AND sh.shipping_status IS NOT NULL
     AND sh.shipping_status <> 'Label Created'
   ORDER BY sh.created_at ASC NULLS FIRST, sh.id ASC
   LIMIT 1
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', ord.number,
         'direction', ord.direction::text,
         'tracking_number', leg.tracking_number,
         'rows', jsonb_build_array(
                   jsonb_build_object('label', 'Carrier',
                                      'value', COALESCE(leg.service_name, 'FedEx')),
                   jsonb_build_object('label', 'Tracking',
                                      'value', COALESCE(leg.tracking_number, '-')),
                   jsonb_build_object(
                     'label', 'Expected arrival',
                     'value', COALESCE(
                       to_char(leg.est_delivery AT TIME ZONE 'America/Chicago', 'FMDy, FMMon ')
                         || to_char(leg.est_delivery AT TIME ZONE 'America/Chicago', 'FMDD'),
                       'When it arrives')))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  JOIN leg ON TRUE
