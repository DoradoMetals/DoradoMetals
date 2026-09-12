-- The lot screen's five cards in one read (ruling 71). lot_ref computes every
-- lot's "Lot 2481-A" reference once, so the parent/successor/children/
-- combined-from lookups below are joins, not five copies of the same
-- seat-numbering logic. The position expression is shared with list.sql,
-- search.sql and position_of.sql, so this screen and the table it was opened
-- from cannot disagree about where the lot is.
WITH lot_ref AS (
  SELECT r.id,
         CASE WHEN ro2.number IS NULL THEN NULL
              ELSE 'Lot ' || ro2.number || '-' || chr(64 + rseat.n::int) END AS reference
    FROM lots.items r
    LEFT JOIN orders.lots rol ON rol.lot_id = r.id
    LEFT JOIN orders.orders ro2 ON ro2.id = rol.order_id
    LEFT JOIN LATERAL (
           SELECT count(*) AS n FROM orders.lots rpeer
            WHERE rpeer.order_id = rol.order_id
              AND (rpeer.created_at, rpeer.id) <= (rol.created_at, rol.id)
         ) rseat ON TRUE
)
SELECT jsonb_build_object(
         'lot', jsonb_build_object(
           'id', li.id, 'bullion_id', li.bullion_id, 'metal_id', li.metal_id,
           'unit', li.unit, 'quantity', li.quantity, 'pre_melt', li.pre_melt,
           'post_melt', li.post_melt, 'purity', li.purity,
           'content_snapshot', li.content_snapshot, 'content', li.content,
           'image_id', li.image_id, 'split_from_id', li.split_from_id,
           'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'created_by_id', li.created_by_id, 'updated_by_id', li.updated_by_id,
           'declared_unit', li.declared_unit, 'declared_quantity', li.declared_quantity,
           'declared_pre_melt', li.declared_pre_melt, 'declared_post_melt', li.declared_post_melt,
           'declared_purity', li.declared_purity, 'declared_content', li.declared_content,
           'assayed_at', to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'combined_into_id', li.combined_into_id,
           'product_name', b.name, 'form', COALESCE(b.type, 'Scrap'),
           'reference', lr.reference,
           'position', /*__lot_position__*/,
           'order_id', od.id, 'order_number', od.number,
           'order_reference', CASE WHEN od.number IS NULL THEN NULL
                                    ELSE (CASE WHEN od.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                                         || od.number END,
           'order_direction', od.direction::text,
           'refining_order_id', ro.id, 'refining_order_number', ro.number,
           'refining_order_reference', CASE WHEN ro.number IS NULL THEN NULL
                                             ELSE 'RO-' || ro.number END,
           'refiner_id', ro.refiner_id, 'refiner_name', org.name,
           'variance', CASE WHEN li.content IS NULL OR li.declared_content IS NULL THEN NULL
                            ELSE li.content - li.declared_content END),
         'where', jsonb_build_object(
           'order', CASE WHEN od.id IS NULL THEN NULL
                         ELSE jsonb_build_object(
                           'id', od.id, 'number', od.number,
                           'reference', (CASE WHEN od.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                                        || od.number,
                           'direction', od.direction::text) END,
           'refining_order', CASE WHEN ro.id IS NULL THEN NULL
                                  ELSE jsonb_build_object(
                                    'id', ro.id, 'number', ro.number,
                                    'reference', 'RO-' || ro.number,
                                    'state', CASE WHEN ro.cancelled_at IS NOT NULL THEN 'Cancelled'
                                                  WHEN ro.disputed_at IS NOT NULL THEN 'Disputed'
                                                  WHEN ro.settled_at IS NOT NULL THEN 'Settled'
                                                  ELSE 'Pending assay' END) END,
           'refiner', CASE WHEN rf.id IS NULL THEN NULL
                           ELSE jsonb_build_object('id', rf.id, 'name', org.name) END),
         'worth', jsonb_build_object(
           'declared_content', li.declared_content, 'content', li.content,
           'variance', CASE WHEN li.content IS NULL OR li.declared_content IS NULL THEN NULL
                            ELSE li.content - li.declared_content END,
           'premium', ol.premium, 'price', ol.price,
           'payable', CASE WHEN li.content IS NULL OR ol.premium IS NULL THEN NULL
                           ELSE li.content * ol.premium END,
           'settled', CASE WHEN rl.id IS NULL THEN NULL
                           ELSE jsonb_build_object(
                             'post_melt', rl.post_melt, 'purity', rl.purity, 'content', rl.content,
                             'settled_at',
                               to_char(rl.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                           END),
         'lineage', jsonb_build_object(
           'split_from_id', li.split_from_id,
           'split_from_reference', parent.reference,
           'children', COALESCE(children.rows, '[]'::jsonb),
           'combined_into_id', li.combined_into_id,
           'combined_into_reference', successor.reference,
           'combined_from', COALESCE(combined_from.rows, '[]'::jsonb)),
         'timeline', COALESCE(timeline.steps, '[]'::jsonb)
       ) AS view
  FROM lots.items li
  LEFT JOIN lot_ref lr ON lr.id = li.id
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.lots ol ON ol.lot_id = li.id
  LEFT JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN refining.lots rl ON rl.lot_id = li.id
  LEFT JOIN refining.orders ro ON ro.id = rl.refining_order_id
  LEFT JOIN refiners.refiners rf ON rf.id = ro.refiner_id
  LEFT JOIN organizations.organizations org ON org.id = rf.organization_id
  LEFT JOIN lot_ref parent ON parent.id = li.split_from_id
  LEFT JOIN lot_ref successor ON successor.id = li.combined_into_id
  LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('id', c.id, 'reference', cr.reference)
                          ORDER BY c.created_at ASC) AS rows
           FROM lots.items c
           LEFT JOIN lot_ref cr ON cr.id = c.id
          WHERE c.split_from_id = li.id
       ) children ON TRUE
  LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('id', m.id, 'reference', mr.reference)
                          ORDER BY m.created_at ASC) AS rows
           FROM lots.items m
           LEFT JOIN lot_ref mr ON mr.id = m.id
          WHERE m.combined_into_id = li.id
       ) combined_from ON TRUE
  LEFT JOIN LATERAL (
         SELECT jsonb_agg(step ORDER BY (step ->> 'at')) AS steps
           FROM (
             SELECT jsonb_build_object(
                      'step', 'Received',
                      'at', to_char(COALESCE(s.delivered_at, f.updated_at) AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', f.updated_by_id) AS step
               FROM fulfillments.arrivals a
               JOIN fulfillments.fulfillments f ON f.id = a.fulfillment_id
               LEFT JOIN LATERAL (
                      SELECT min(sh.delivered_at) AS delivered_at
                        FROM fulfillments.shipments fs
                        JOIN shipping.shipments sh ON sh.id = fs.shipment_id
                       WHERE fs.fulfillment_id = f.id AND sh.direction = 'Inbound'
                    ) s ON TRUE
              WHERE a.order_id = od.id AND a.arrived
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Assayed',
                      'at', to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', li.updated_by_id)
              WHERE li.assayed_at IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Sent',
                      'at', to_char(ro.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', ro.updated_by_id)
              WHERE ro.sent_at IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Settled',
                      'at', to_char(ro.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', ro.updated_by_id)
              WHERE ro.settled_at IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Sold',
                      'at', to_char(ol.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', ol.created_by_id)
              WHERE od.direction = 'sale' AND ol.created_at IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Split',
                      'at', to_char(fc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', fc.created_by_id)
               FROM (SELECT created_at, created_by_id FROM lots.items
                      WHERE split_from_id = li.id
                      ORDER BY created_at ASC LIMIT 1) fc
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Combined',
                      'at', to_char(sc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', sc.created_by_id)
               FROM lots.items sc WHERE sc.id = li.combined_into_id
           ) steps
       ) timeline ON TRUE
 WHERE li.id = $1
