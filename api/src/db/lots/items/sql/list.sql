-- The inventory table and the lots ledger, one read: position=* is the
-- ledger, any narrower position list is the inventory table. Every filter is
-- optional. The position expression is shared with position_of.sql,
-- view_one.sql and search.sql via the repo's substitution, so no two reads
-- can disagree about where a lot is.
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
            ELSE 'Lot ' || od.number || '-' || chr(64 + seat.n::int) END AS reference,
       /*__lot_position__*/ AS position,
       od.id AS order_id,
       od.number AS order_number,
       CASE WHEN od.number IS NULL THEN NULL
            ELSE (CASE WHEN od.direction = 'sale' THEN 'SO-' ELSE 'PO-' END) || od.number
       END AS order_reference,
       od.direction::text AS order_direction,
       ro.id AS refining_order_id,
       ro.number AS refining_order_number,
       CASE WHEN ro.number IS NULL THEN NULL ELSE 'RO-' || ro.number END AS refining_order_reference,
       ro.refiner_id AS refiner_id,
       org.name AS refiner_name,
       CASE WHEN li.content IS NULL OR li.declared_content IS NULL THEN NULL
            ELSE li.content - li.declared_content END AS variance
  FROM lots.items li
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.lots ol ON ol.lot_id = li.id
  LEFT JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN LATERAL (
         SELECT count(*) AS n FROM orders.lots peer
          WHERE peer.order_id = ol.order_id
            AND (peer.created_at, peer.id) <= (ol.created_at, ol.id)
       ) seat ON TRUE
  LEFT JOIN refining.lots rl ON rl.lot_id = li.id
  LEFT JOIN refining.orders ro ON ro.id = rl.refining_order_id
  LEFT JOIN refiners.refiners rf ON rf.id = ro.refiner_id
  LEFT JOIN organizations.organizations org ON org.id = rf.organization_id
 WHERE ($1::text[] IS NULL OR /*__lot_position__*/ = ANY($1::text[]))
   AND ($2::text IS NULL OR li.metal_id = $2::text)
   AND ($3::text IS NULL
        OR ($3::text = 'scrap' AND li.bullion_id IS NULL)
        OR ($3::text = 'bullion' AND li.bullion_id IS NOT NULL))
   AND ($4::uuid IS NULL OR od.id = $4::uuid)
   AND ($5::uuid IS NULL OR ro.refiner_id = $5::uuid)
   AND ($6::text IS NULL
        OR b.name ILIKE '%' || $6::text || '%'
        OR li.metal_id ILIKE '%' || $6::text || '%'
        OR od.number::text ILIKE '%' || $6::text || '%')
   AND ($7::boolean IS NOT TRUE
        OR NOT EXISTS (SELECT 1 FROM refining.lots held WHERE held.lot_id = li.id))
 ORDER BY li.created_at DESC, li.id ASC
