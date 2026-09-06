-- The refiner engagements become refiner ORDERS, with their own direction.
--
-- refiners.orders is one row per CUSTOMER order and carries a nullable refiner,
-- so it can express neither pooling nor a supplier order of the business's own.
-- refining.orders is the business's order: a `sell` when our scrap goes out to
-- be refined (a customer PURCHASE order, where we buy the metal and sell it on
-- to the refinery), a `buy` when the supplier fills a customer's SALES order.
--
-- THE ENGAGEMENT'S ID IS KEPT, exactly as 161 keeps a line's id. Every one of
-- dev's 31 engagements carries the same created_at and updated_at - 093/094
-- seeded them in one statement - so nothing else about the row identifies it,
-- and a backfill that matched on its columns collapsed 41 lots onto 2 orders.
--
-- Only the 31 engagements that name a refiner carry forward; the other 61 are
-- empty mirrors minted for every order by `mirrorForOrder` and hold no value at
-- all - measured 2026-09-08: 0 of their 62 item rows carries an assay, a
-- premium or a fee. refiners.orders keeps all 92 rows either way.
--
-- sent_at is stamped from the engagement's own updated_at rather than left
-- null: an engagement that names a refiner is metal already committed to that
-- refiner, and `one_open_sell_order_per_refiner` would otherwise refuse the
-- second row of the sixteen that name the same one.

INSERT INTO refining.orders
       (id, direction, refiner_id, sent_at, fee, created_at, updated_at)
SELECT ro.id,
       CASE o.direction WHEN 'purchase' THEN 'sell'::refining.direction
                        ELSE 'buy'::refining.direction END,
       ro.refiner_id,
       ro.updated_at,
       ro.fee,
       ro.created_at,
       ro.updated_at
  FROM refiners.orders ro
  JOIN orders.orders o ON o.id = ro.order_id
 WHERE ro.refiner_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM refining.orders r WHERE r.id = ro.id);

INSERT INTO refining.lots
       (refining_order_id, lot_id, unit, pre_melt, post_melt, purity, premium,
        created_at, updated_at)
SELECT ri.refiner_order_id,
       ri.order_item_id,
       COALESCE(ri.unit, 't oz'),
       ri.pre_melt,
       ri.post_melt,
       ri.purity,
       ri.premium,
       ro.created_at,
       ro.updated_at
  FROM refiners.items ri
  JOIN refining.orders ro ON ro.id = ri.refiner_order_id
  JOIN lots.items li ON li.id = ri.order_item_id
 WHERE NOT EXISTS (SELECT 1 FROM refining.lots rl WHERE rl.lot_id = ri.order_item_id);
