-- The inventory table and the lots ledger, one read: position=* is the
-- ledger, any narrower position list is the inventory table. Every filter is
-- optional. The position expression is shared with position_of.sql,
-- view_one.sql and search.sql via the repo's substitution, so no two reads
-- can disagree about where a lot is. own_lot keeps a refiner's copy of a lot
-- and a minted sale lot from ever appearing here alongside the stock lot
-- they came from - counting either would double the metal.
--
-- The refining_order/refiner columns resolve through the lot's BATCH CHILD
-- (the lot_sources 'batch' edge sourced from this lot), never through a
-- refining.lots row on the lot itself - after the lot model split, a lot
-- reached directly by refining.lots IS the refiner's own copy, never a
-- customer lot.
SELECT li.id, li.bullion_id, li.metal_id, li.unit, li.quantity,
       li.pre_melt, li.post_melt, li.purity, li.content_snapshot, li.content,
       li.image_id,
       to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       li.created_by_id, li.updated_by_id,
       li.declared_unit, li.declared_quantity, li.declared_pre_melt,
       li.declared_post_melt, li.declared_purity, li.declared_content,
       to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
       li.premium, li.sales_tax_rate,
       to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS confirmed_at,
       to_char(li.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       li.settled_spot, li.source::text AS source,
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
       CASE WHEN ro.number IS NULL THEN NULL
            ELSE (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END) || ro.number
       END AS refining_order_reference,
       ro.refiner_id AS refiner_id,
       org.name AS refiner_name,
       CASE WHEN li.content IS NULL OR li.declared_content IS NULL THEN NULL
            ELSE li.content - li.declared_content END AS variance
  FROM inventory.lots li
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.lots ol ON ol.lot_id = li.id
  LEFT JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN LATERAL (
         SELECT count(*) AS n FROM orders.lots peer
          WHERE peer.order_id = ol.order_id
            AND (peer.created_at, peer.id) <= (ol.created_at, ol.id)
       ) seat ON TRUE
  LEFT JOIN LATERAL (
         SELECT bs.lot_id AS refiner_lot_id
           FROM inventory.lot_sources bs
          WHERE bs.source_lot_id = li.id AND bs.kind = 'batch'
          ORDER BY bs.created_at DESC, bs.id DESC
          LIMIT 1
       ) batch ON TRUE
  LEFT JOIN refining.lots rl ON rl.lot_id = batch.refiner_lot_id
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
        OR (NOT EXISTS (SELECT 1 FROM inventory.lot_sources held
                         WHERE held.source_lot_id = li.id AND held.kind = 'batch')
            AND NOT EXISTS (SELECT 1 FROM refining.lots held2 WHERE held2.lot_id = li.id)))
   AND /*__own_lot__*/
 ORDER BY li.created_at DESC, li.id ASC
