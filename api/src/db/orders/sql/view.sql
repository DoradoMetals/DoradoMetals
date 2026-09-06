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
                   to_jsonb(i)
                   || jsonb_build_object(
                        'product_name',
                        (SELECT b.name FROM products.bullion b WHERE b.id = i.bullion_id),
                        'payable',
                        CASE WHEN i.content IS NULL OR i.premium IS NULL THEN NULL
                             ELSE i.content * i.premium END,
                        'line_total',
                        CASE WHEN i.price IS NULL THEN NULL
                             WHEN i.bullion_id IS NULL THEN i.price
                             ELSE i.price * COALESCE(i.quantity, 1) END)
                   ORDER BY i.id ASC)
            FROM (SELECT it.*,
                         -- What a scrap lot is called on a document: numbered
                         -- per metal across the order's scrap lines, in id
                         -- order. A product line is named by its product, so it
                         -- has no item_name. This is the numbering the packing
                         -- list and the invoice used to stitch into a Map.
                         CASE WHEN it.bullion_id IS NULL
                              THEN it.metal_id || ' Item '
                                   || row_number() OVER (
                                        PARTITION BY (it.bullion_id IS NULL), it.metal_id
                                            ORDER BY it.id ASC)
                              END AS item_name
                    FROM orders.items it
                   WHERE it.order_id = o.id) i),
         '[]'::jsonb) AS items,
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
       (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email)
          FROM auth.users u
         WHERE u.id = o.user_id) AS "user",
       -- Whether this order's payout has already been credited to the
       -- customer's balance. The add_funds action turns itself off from it, and
       -- the endpoint refuses on it (MP F4).
       EXISTS (SELECT 1 FROM payments.ledger l
                WHERE l.order_id = o.id AND l.type = 'Credit') AS credited
  FROM orders.orders o
 WHERE o.id = $1
