-- Removes new-schema rows that exchange has no counterpart for.
--
-- Production's new schemas were built by a migration attempt in January that was
-- abandoned, and exchange has kept moving since. Three purchase orders exist in
-- orders.orders with nothing behind them in exchange - 298, 299 and 303 - along
-- with four of their items. They were cancelled and removed from exchange after
-- January, so the new schema is holding a copy of something the business has
-- deliberately deleted.
--
-- The rule, decided 2026-08-23: exchange is the source of truth. Anything the
-- new schema holds that exchange does not is residue, not data.
--
-- This is why audit:guards refuses: every backfill checks whether the target
-- holds rows the source does not, because if it does, re-deriving from exchange
-- would overwrite something. Here it would not - there is nothing to overwrite,
-- only stale copies to drop - and until they go, no backfill can run.
--
-- Destructive only to the new schemas, which are derived and have never been
-- promoted: every row deleted here is either reproducible from exchange or is a
-- copy of something exchange no longer has. exchange itself is only read.
--
-- Children before parents, so nothing depends on a cascade rule being what we
-- assume it is.

-- A refiner's line for an order item exchange no longer has. Also catches the
-- sales-order lines January created, which never made sense: a sales order ships
-- bullion to a customer and never sees a refiner.
DELETE FROM refiners.items ri
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.purchase_order_items e WHERE e.id = ri.order_item_id
);

DELETE FROM orders.items i
WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_order_items e WHERE e.id = i.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_order_items e WHERE e.id = i.id);

-- Everything hanging off an order that exchange no longer has.
DELETE FROM orders.addresses a
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.purchase_orders e WHERE e.id = a.order_id
) AND NOT EXISTS (
  SELECT 1 FROM exchange.sales_orders e WHERE e.id = a.order_id
);

DELETE FROM orders.spots s
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.purchase_orders e WHERE e.id = s.order_id
) AND NOT EXISTS (
  SELECT 1 FROM exchange.sales_orders e WHERE e.id = s.order_id
);

-- 2026-09-06: guarded. 086 removes orders.offers, so a genesis build has no
-- such table and nothing to prune from it.
DO $$
BEGIN
  IF to_regclass('orders.offers') IS NOT NULL THEN
    DELETE FROM orders.offers f
    WHERE NOT EXISTS (
      SELECT 1 FROM exchange.purchase_orders e WHERE e.id = f.order_id
    );
  END IF;
END $$;

DELETE FROM orders.transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.purchase_orders e WHERE e.id = t.order_id
) AND NOT EXISTS (
  SELECT 1 FROM exchange.sales_orders e WHERE e.id = t.order_id
);

DELETE FROM orders.orders o
WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_orders e WHERE e.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders e WHERE e.id = o.id);
