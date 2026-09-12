-- `orders.items` AND `checkout.items` GO (ruling 120).
--
-- Migration 160 replaced both with `inventory.lots` plus a link table per
-- schema, 161 and 162 carried every row across keeping its id, and no
-- application statement has read either table since. They were kept unread for
-- one release; the release is over.
--
-- THEY ARE NOT LOST FROM THE REBUILD. `exchange.purchase_order_items`,
-- `exchange.sales_order_items`, `exchange.cart_items` and
-- `exchange.sell_cart_items` are frozen and still hold every row either table
-- was built from. A build from nothing still stages through both:
-- `027a_the_two_item_tables_are_staging.sql` creates them, 028 to 173 fill and
-- read them, and this file drops them at the end of that chain.
--
-- `refiners.items.order_item_id` loses its foreign key and keeps its value:
-- the column is the legacy refiner line's own pointer and `audit:coverage`
-- still maps it.
--
-- `exchange` is neither read nor written, and neither table is `exchange`.

ALTER TABLE refiners.items DROP CONSTRAINT IF EXISTS refiners_items_order_item_id_fk;

DO $$
DECLARE
  order_items bigint := 0;
  cart_items bigint := 0;
  lots bigint;
BEGIN
  IF to_regclass('orders.items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM orders.items' INTO order_items;
  END IF;
  IF to_regclass('checkout.items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM checkout.items' INTO cart_items;
  END IF;
  SELECT count(*) INTO lots FROM inventory.lots;
  RAISE NOTICE 'dropping orders.items (% row(s)) and checkout.items (% row(s)); inventory.lots holds % lot(s)',
    order_items, cart_items, lots;
END $$;

DROP TABLE IF EXISTS orders.items;
DROP TABLE IF EXISTS checkout.items;
