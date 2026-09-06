SELECT to_jsonb(o)
       || jsonb_build_object(
            'created_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         AS "order",
       (SELECT to_jsonb(t)
               || jsonb_build_object(
                    'created_at', to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'updated_at', to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM orders.transactions t
         WHERE t.order_id = o.id) AS totals,
       COALESCE(
         (SELECT jsonb_agg(
                   to_jsonb(ol)
                   || jsonb_build_object(
                        'created_at', to_char(ol.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'updated_at', to_char(ol.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'lot', to_jsonb(li)
                               || jsonb_build_object(
                                    'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                    'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                    'product_name', b.name,
                                    -- What a lot is CALLED and what shape it is
                                    -- in. 'Scrap' for a declared lot, the
                                    -- product's own type for a catalogue one.
                                    'form', COALESCE(b.type, 'Scrap'),
                                    -- "Lot 2481-A": the order's number and a
                                    -- letter per lot, in placement order. It is
                                    -- what the admin screens and the refiner's
                                    -- paperwork quote, and it survives the move
                                    -- to a refiner order because it is derived
                                    -- from where the lot CAME FROM.
                                    'reference', 'Lot ' || o.number || '-' || chr(64 + ol.seat::int)),
                        'payable',
                          CASE WHEN li.content IS NULL OR ol.premium IS NULL THEN NULL
                               ELSE li.content * ol.premium END,
                        'line_total',
                          CASE WHEN ol.price IS NULL THEN NULL
                               WHEN li.bullion_id IS NULL THEN ol.price
                               ELSE ol.price * li.quantity END,
                        'settled',
                          CASE WHEN li.bullion_id IS NOT NULL THEN ol.confirmed
                               ELSE EXISTS (SELECT 1 FROM refining.lots rl
                                             WHERE rl.lot_id = ol.lot_id
                                               AND rl.settled_at IS NOT NULL) END,
                        'refining_order_number',
                          (SELECT ro.number FROM refining.lots rl
                             JOIN refining.orders ro ON ro.id = rl.refining_order_id
                            WHERE rl.lot_id = ol.lot_id))
                   ORDER BY ol.seat ASC)
            FROM (SELECT l.*,
                         row_number() OVER (PARTITION BY l.order_id
                                                ORDER BY l.created_at ASC, l.id ASC) AS seat
                    FROM orders.lots l
                   WHERE l.order_id = o.id) ol
            JOIN lots.items li ON li.id = ol.lot_id
            LEFT JOIN products.bullion b ON b.id = li.bullion_id),
         '[]'::jsonb) AS lots,
       (SELECT to_jsonb(a)
               || jsonb_build_object(
                    'created_at', to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'updated_at', to_char(a.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM orders.addresses oa
          JOIN places.addresses a ON a.id = oa.address_id
         WHERE oa.order_id = o.id
         ORDER BY oa.id ASC
         LIMIT 1) AS address,
       COALESCE(
         (SELECT jsonb_agg(
                   jsonb_build_object(
                     'id', s.id,
                     'carrier_service_id', s.carrier_service_id,
                     'package_id', s.package_id,
                     'recipient_address_id', s.recipient_address_id,
                     'shipper_address_id', s.shipper_address_id,
                     'tracking_number', s.tracking_number,
                     'delivered_at', to_char(s.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                     'shipped_at', to_char(s.shipped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                     'est_delivery', to_char(s.est_delivery AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                     'label_type', s.label_type,
                     'label', encode(s.label, 'base64'),
                     'direction', s.direction::text,
                     'insured', s.insured,
                     'additional_coverage', s.additional_coverage,
                     'bill_return_to_customer', s.bill_return_to_customer,
                     'declared_value', s.declared_value,
                     'cost', s.cost,
                     'actual_cost', s.actual_cost,
                     'shipping_status', s.shipping_status,
                     'pickup_type', s.pickup_type,
                     'pickup_date', s.pickup_date,
                     'pickup_time', s.pickup_time,
                     'service_name',
                     (SELECT cs.name FROM shipping.services cs
                       WHERE cs.id = s.carrier_service_id),
                     'package_label',
                     (SELECT pk.label FROM shipping.packages pk
                       WHERE pk.id = s.package_id),
                     'created_at', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   ORDER BY s.created_at ASC, s.id ASC)
            FROM shipping.shipments s
            JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
            JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
           WHERE f.order_id = o.id),
         '[]'::jsonb) AS shipments,
       (SELECT to_jsonb(p)
               || jsonb_build_object(
                    'requested_at', to_char(p.requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM shipping.pickups p
         WHERE p.shipment_id = (SELECT fs.shipment_id
                                  FROM fulfillments.fulfillments f
                                  JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
                                 WHERE f.order_id = o.id
                                 ORDER BY f.id ASC, fs.id ASC
                                 LIMIT 1)
         ORDER BY p.requested_at DESC, p.id ASC
         LIMIT 1) AS pickup,
       (SELECT jsonb_build_object(
                 'id', d.id,
                 'user_id', d.user_id,
                 'order_id', t.order_id,
                 'method', m.type,
                 'account_holder_name', d.account_holder,
                 'bank_name', d.bank_name,
                 'account_type', d.account_type,
                 'account_last4', d.last_four,
                 'routing_last4', d.routing_last_four,
                 'email_to', d.email_to,
                 'cost', t.payout_fee)
          FROM orders.transactions t
          JOIN payments.details d ON d.id = t.payout_details_id
          LEFT JOIN payments.methods m ON m.id = d.method_id
         WHERE t.order_id = o.id) AS payout,
       (SELECT jsonb_build_object(
                 'id', u.id, 'name', u.name, 'email', u.email,
                 'orders_to_date',
                   (SELECT count(*) FROM orders.orders prior
                     WHERE prior.user_id = u.id))
          FROM auth.users u
         WHERE u.id = o.user_id) AS "user",
       -- The header's PO-2481 / SO-2481. The prefix is a label, and deciding it
       -- in the browser is deciding it in three browsers (ruling 83).
       CASE WHEN o.direction = 'sale' THEN 'SO-' ELSE 'PO-' END || o.number AS reference,
       -- Whether this order's payout has already been credited to the
       -- customer's balance. The add_funds action turns itself off from it, and
       -- the endpoint refuses on it (MP F4).
       EXISTS (SELECT 1 FROM payments.ledger l
                WHERE l.order_id = o.id AND l.type = 'Credit') AS credited
  FROM orders.orders o
 WHERE o.id = $1
