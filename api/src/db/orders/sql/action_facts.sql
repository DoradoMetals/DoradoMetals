-- The facts `actionsFor` decides an order's actions from, as one expression
-- over the orders.orders row `o`. Substituted into list.sql through
-- /*__order_action_facts__*/ so a card offers what its order view offers
-- without a view read per card. Each field is read the way view.sql reads it.
-- The state is added beside it by the caller, which already holds it.
jsonb_build_object(
  'order', jsonb_build_object(
             'direction', o.direction,
             'cancelled_at', to_char(o.cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'spots_locked', o.spots_locked,
             'number', o.number),
  'totals', (SELECT jsonb_build_object('total', t.total)
               FROM orders.transactions t
              WHERE t.order_id = o.id),
  'lots', COALESCE(
            (SELECT jsonb_agg(
                      jsonb_build_object(
                        'lot', jsonb_build_object(
                                 'confirmed_at', to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                 'content', li.content),
                        'settled',
                          CASE WHEN li.bullion_id IS NOT NULL THEN li.confirmed_at IS NOT NULL
                               ELSE EXISTS (SELECT 1 FROM inventory.lot_sources ls
                                             JOIN inventory.lots rlot ON rlot.id = ls.lot_id
                                            WHERE ls.source_lot_id = ol.lot_id
                                              AND ls.kind = 'batch'
                                              AND rlot.settled_at IS NOT NULL) END))
               FROM orders.lots ol
               JOIN inventory.lots li ON li.id = ol.lot_id
              WHERE ol.order_id = o.id),
            '[]'::jsonb),
  'address', (SELECT jsonb_build_object('id', a.id)
                FROM orders.addresses oa
                JOIN places.addresses a ON a.id = oa.address_id
               WHERE oa.order_id = o.id
               ORDER BY oa.id ASC
               LIMIT 1),
  'shipments', COALESCE(
                 (SELECT jsonb_agg(jsonb_build_object('direction', s.direction::text,
                                                      'tracking_number', s.tracking_number))
                    FROM shipping.shipments s
                    JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
                    JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
                   WHERE f.order_id = o.id),
                 '[]'::jsonb),
  'payout', (SELECT jsonb_build_object('method', m.type)
               FROM orders.transactions t
               JOIN payments.details d ON d.id = t.payout_details_id
               LEFT JOIN payments.methods m ON m.id = d.method_id
              WHERE t.order_id = o.id),
  'credited', EXISTS (SELECT 1 FROM payments.ledger l
                       WHERE l.order_id = o.id AND l.type = 'Credit')
)
