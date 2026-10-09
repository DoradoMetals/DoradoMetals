-- THE HEADER SEARCH, one read. $1 = what the operator typed.
--
-- Four kinds, one flat row each (ruling: `kind`, `id`, `reference`, `title`),
-- unioned - three per-tab searches would be three places to keep indexed.
--
-- Every clause is a PREFIX against an indexed expression (migration 265): a
-- btree can be entered by `lower(col) LIKE 'typed%'` and by nothing else, and
-- a prefix is what a header box types. The order number is matched with its
-- `PO-`/`SO-`/`RP-`/`RS-`/`LEAD-` prefix stripped off the TYPING, not off the
-- column, so the right-hand side stays a constant the index can seek to.
WITH typed AS (
  SELECT lower($1::text) AS q,
         regexp_replace(lower($1::text), '^(po|so|rp|rs|lot|lead)[- ]*', '') AS n
)
SELECT 'order' AS kind,
       o.id,
       (CASE WHEN o.direction = 'sale' THEN 'SO-' ELSE 'PO-' END) || o.number AS reference,
       COALESCE(u.name, u.email, 'No customer') AS title
  FROM typed, orders.orders o
  LEFT JOIN auth.users u ON u.id = o.user_id
 WHERE (o.number)::text LIKE typed.n || '%'
 UNION ALL
SELECT 'customer' AS kind,
       u.id,
       COALESCE(u.name, u.email) AS reference,
       u.email AS title
  FROM typed, auth.users u
 WHERE u."isAnonymous" IS NOT TRUE
   AND (lower(u.name) LIKE typed.q || '%' OR lower(u.email) LIKE typed.q || '%')
 UNION ALL
SELECT 'lead' AS kind,
       l.id,
       l.number AS reference,
       l.name AS title
  FROM typed, leads.leads l
 WHERE lower(l.name) LIKE typed.q || '%' OR lower(l.number) LIKE typed.q || '%'
 UNION ALL
SELECT 'lot' AS kind,
       li.id,
       'Lot ' || od.number || '-' || chr(64 + seat.n::int) AS reference,
       COALESCE(b.name, li.metal_id || ' ' || COALESCE(b.type, 'Scrap')) AS title
  FROM typed, inventory.lots li
  JOIN orders.lots ol ON ol.lot_id = li.id
  JOIN orders.orders od ON od.id = ol.order_id
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  CROSS JOIN LATERAL (
         SELECT count(*) AS n
           FROM orders.lots peer
          WHERE peer.order_id = ol.order_id
            AND (peer.created_at, peer.id) <= (ol.created_at, ol.id)
       ) seat
 WHERE lower(b.name) LIKE typed.q || '%'
    OR (od.number)::text LIKE typed.n || '%'
 ORDER BY kind ASC, reference ASC
 LIMIT 50
