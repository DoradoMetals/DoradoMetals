-- The Adding Lot autocomplete. $1 is the operator's typing, matched against the
-- product name, the metal and the lot's own reference; $2 narrows to lots no
-- refiner order holds. The reference and the product name are derived the same
-- way the order view derives them, so one lot reads the same everywhere.
SELECT li.id, li.bullion_id, li.metal_id, li.unit, li.quantity,
       li.pre_melt, li.post_melt, li.purity, li.content_snapshot, li.content,
       li.image_id, li.split_from_id,
       to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       li.created_by_id, li.updated_by_id,
       li.declared_unit, li.declared_quantity, li.declared_pre_melt,
       li.declared_post_melt, li.declared_purity, li.declared_content,
       to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
       li.combined_into_id,
       b.name AS product_name,
       COALESCE(b.type, 'Scrap') AS form,
       CASE WHEN od.number IS NULL THEN NULL
            ELSE 'Lot ' || od.number || '-' || chr(64 + seat.n::int) END AS reference
  FROM lots.items li
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.lots ol ON ol.lot_id = li.id
  LEFT JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN LATERAL (
         SELECT count(*) AS n FROM orders.lots peer
          WHERE peer.order_id = ol.order_id
            AND (peer.created_at, peer.id) <= (ol.created_at, ol.id)
       ) seat ON TRUE
 WHERE ($2::boolean IS NOT TRUE
        OR NOT EXISTS (SELECT 1 FROM refining.lots rl WHERE rl.lot_id = li.id))
   AND ($1::text IS NULL
        OR b.name ILIKE '%' || $1::text || '%'
        OR li.metal_id ILIKE '%' || $1::text || '%'
        OR od.number::text ILIKE '%' || $1::text || '%')
 ORDER BY li.created_at DESC, li.id ASC
 LIMIT 50
