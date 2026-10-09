-- The lot screen's five cards in one read (ruling 71). lot_ref computes every
-- lot's "Lot 2481-A" reference once, so the sources/derived lookups below are
-- joins, not repeated copies of the same seat-numbering logic. The position
-- expression is shared with list.sql, search.sql and position_of.sql, so this
-- screen and the table it was opened from cannot disagree about where the
-- lot is.
--
-- batch_edge is the lot's own batch child - the refiner lot minted from it
-- (inventory.lot_sources kind='batch', source_lot_id = this lot). Everything
-- that used to read a refining.lots row directly on the lot now reads it
-- through that edge, because a lot reached directly by refining.lots IS a
-- refiner lot, never a customer lot.
WITH lot_ref AS (
  SELECT r.id,
         CASE WHEN ro2.number IS NULL THEN NULL
              ELSE 'Lot ' || ro2.number || '-' || chr(64 + rseat.n::int) END AS reference
    FROM inventory.lots r
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
           'image_id', li.image_id,
           'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'created_by_id', li.created_by_id, 'updated_by_id', li.updated_by_id,
           'declared_unit', li.declared_unit, 'declared_quantity', li.declared_quantity,
           'declared_pre_melt', li.declared_pre_melt, 'declared_post_melt', li.declared_post_melt,
           'declared_purity', li.declared_purity, 'declared_content', li.declared_content,
           'assayed_at', to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'premium', li.premium, 'sales_tax_rate', li.sales_tax_rate,
           'confirmed_at',
             to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'settled_at', to_char(li.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'settled_spot', li.settled_spot, 'source', li.source::text,
           'line_reference', li.line_reference,
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
                                             ELSE (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END)
                                                  || ro.number END,
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
                                    'reference', (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END)
                                                 || ro.number,
                                    'state', (/*__refining_state__*/)) END,
           'refiner', CASE WHEN rf.id IS NULL THEN NULL
                           ELSE jsonb_build_object('id', rf.id, 'name', org.name) END),
         'worth', jsonb_build_object(
           'declared_content', li.declared_content, 'content', li.content,
           'variance', CASE WHEN li.content IS NULL OR li.declared_content IS NULL THEN NULL
                            ELSE li.content - li.declared_content END,
           'premium', li.premium,
           'price', CASE WHEN li.content IS NULL OR li.premium IS NULL OR od.id IS NULL THEN NULL
                         ELSE li.content * li.premium *
                              (CASE WHEN od.direction = 'purchase' THEN COALESCE(os.bid, sp.bid)
                                    ELSE COALESCE(os.ask, sp.ask) END)
                    END,
           'payable', CASE WHEN li.content IS NULL OR li.premium IS NULL THEN NULL
                           ELSE li.content * li.premium END,
           'settled', CASE WHEN rl.id IS NULL THEN NULL
                           ELSE jsonb_build_object(
                             'lot_id', flot.id,
                             'pre_melt', flot.pre_melt, 'post_melt', flot.post_melt,
                             'purity', flot.purity, 'content', flot.content,
                             'premium', flot.premium, 'settled_spot', flot.settled_spot,
                             'settled_at',
                               to_char(flot.settled_at AT TIME ZONE 'UTC',
                                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                             'share', CASE WHEN (SELECT count(*) FROM inventory.lot_sources bs2
                                                   WHERE bs2.lot_id = batch_edge.refiner_lot_id
                                                     AND bs2.kind = 'batch') > 1
                                           THEN li.declared_content /
                                                (SELECT sum(s4.declared_content)
                                                   FROM inventory.lot_sources bs4
                                                   JOIN inventory.lots s4
                                                     ON s4.id = bs4.source_lot_id
                                                  WHERE bs4.lot_id = batch_edge.refiner_lot_id
                                                    AND bs4.kind = 'batch')
                                           ELSE NULL END)
                      END),
         'lineage', jsonb_build_object(
           'sources', COALESCE(sources.rows, '[]'::jsonb),
           'derived', COALESCE(derived.rows, '[]'::jsonb)),
         'timeline', COALESCE(timeline.steps, '[]'::jsonb)
       ) AS view
  FROM inventory.lots li
  LEFT JOIN lot_ref lr ON lr.id = li.id
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.lots ol ON ol.lot_id = li.id
  LEFT JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN orders.spots os ON os.order_id = od.id AND os.metal_id = li.metal_id
  LEFT JOIN spots.spots sp ON sp.metal_id = li.metal_id
  LEFT JOIN LATERAL (
         SELECT bs.lot_id AS refiner_lot_id, bs.created_at AS batched_at,
                bs.created_by_id AS batched_by_id
           FROM inventory.lot_sources bs
          WHERE bs.source_lot_id = li.id AND bs.kind = 'batch'
          ORDER BY bs.created_at DESC, bs.id DESC
          LIMIT 1
       ) batch_edge ON TRUE
  LEFT JOIN inventory.lots flot ON flot.id = batch_edge.refiner_lot_id
  LEFT JOIN refining.lots rl ON rl.lot_id = batch_edge.refiner_lot_id
  LEFT JOIN refining.orders ro ON ro.id = rl.refining_order_id
  LEFT JOIN refiners.refiners rf ON rf.id = ro.refiner_id
  LEFT JOIN organizations.organizations org ON org.id = rf.organization_id
  LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', s.id, 'reference', sr.reference, 'kind', ls.kind,
                    'content', s.content,
                    'share', CASE WHEN (SELECT count(*) FROM inventory.lot_sources ls2
                                          WHERE ls2.lot_id = li.id) > 1
                                  THEN s.content /
                                       (SELECT sum(s2.content) FROM inventory.lot_sources ls2
                                          JOIN inventory.lots s2 ON s2.id = ls2.source_lot_id
                                         WHERE ls2.lot_id = li.id)
                                  ELSE NULL END)
                  ORDER BY ls.created_at ASC, ls.id ASC) AS rows
           FROM inventory.lot_sources ls
           JOIN inventory.lots s ON s.id = ls.source_lot_id
           LEFT JOIN lot_ref sr ON sr.id = s.id
          WHERE ls.lot_id = li.id
       ) sources ON TRUE
  LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', d.id, 'reference', dr.reference, 'kind', ld.kind,
                    'content', d.content,
                    'share', CASE WHEN (SELECT count(*) FROM inventory.lot_sources ld2
                                          WHERE ld2.lot_id = ld.lot_id) > 1
                                  THEN li.content /
                                       (SELECT sum(s3.content) FROM inventory.lot_sources ld3
                                          JOIN inventory.lots s3 ON s3.id = ld3.source_lot_id
                                         WHERE ld3.lot_id = ld.lot_id)
                                  ELSE NULL END)
                  ORDER BY ld.created_at ASC, ld.id ASC) AS rows
           FROM inventory.lot_sources ld
           JOIN inventory.lots d ON d.id = ld.lot_id
           LEFT JOIN lot_ref dr ON dr.id = d.id
          WHERE ld.source_lot_id = li.id
       ) derived ON TRUE
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
                      'step', 'Confirmed',
                      'at', to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', li.updated_by_id)
              WHERE li.confirmed_at IS NOT NULL
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Batched',
                      'at', to_char(batch_edge.batched_at AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', batch_edge.batched_by_id)
              WHERE batch_edge.refiner_lot_id IS NOT NULL
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
               FROM (SELECT created_at, created_by_id FROM inventory.lot_sources
                      WHERE source_lot_id = li.id AND kind = 'split'
                      ORDER BY created_at ASC LIMIT 1) fc
             UNION ALL
             SELECT jsonb_build_object(
                      'step', 'Combined',
                      'at', to_char(cc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'actor_id', cc.created_by_id)
               FROM (SELECT created_at, created_by_id FROM inventory.lot_sources
                      WHERE source_lot_id = li.id AND kind = 'combine'
                      ORDER BY created_at ASC LIMIT 1) cc
           ) steps
       ) timeline ON TRUE
 WHERE li.id = $1
