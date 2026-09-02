-- The order number stops being drawn from an exchange sequence.
--
-- *** THE LAST WRITE TO exchange ON THE ORDER PATH, and it did not look like a
-- write. *** features/orders/sql/create.sql picks its number with
--
--   nextval(CASE $3 WHEN 'purchase' THEN 'exchange.purchase_orders_order_number_seq'
--                   ELSE 'exchange.sales_orders_order_number_seq' END)
--
-- nextval MUTATES the sequence. So every order created after the Great Purge -
-- which was supposed to have left exchange entirely - still reached into
-- exchange and advanced a counter there. It never appeared in any sweep for
-- exchange writes because it is a function call in a SELECT-shaped expression,
-- not an INSERT, UPDATE or DELETE.
--
-- 079 SAW THIS COMING and built the replacements: orders.purchase_number_seq
-- and orders.sale_number_seq, seeded from GREATEST of three sources. Its
-- closing note says they "sit unread until the promotion commit points at
-- them". This is that commit, and the pointing is done in create.sql.
--
-- *** WHY RE-SEEDING IS REQUIRED AND NOT OPTIONAL. *** 079 seeded at APPLY
-- time. Dev applied it months ago, and exchange's sequence has run far ahead
-- since, because every test run that places an order draws a number and rolls
-- back - a sequence does not give the number back. Measured today:
--
--   orders.purchase_number_seq                 2278
--   exchange.purchase_orders_order_number_seq 15898
--   highest number actually held by a purchase order  15769
--
-- Pointing create.sql at the native sequence without this would issue 2279 -
-- and EIGHTEEN purchase orders already hold a number at or above it. The very
-- next order would violate UNIQUE (direction, number), and the one after that,
-- for thousands of orders. Not data loss, but a create path that refuses every
-- customer, which is why the re-seed and the switch belong in one change.
--
-- The seed is 079's expression verbatim - GREATEST of the exchange maximum, the
-- native maximum and the exchange sequence's own last_value, plus one - because
-- all three still matter for the same reasons 079 gives, and its third source
-- is exactly the one that makes dev's number so much larger than any order's.
--
-- FORWARD ONLY, so this is re-runnable and cannot re-issue a number: it moves a
-- sequence only when the computed seed is higher than where it already sits.
-- exchange is READ ONLY here - two maxima and two last_values, no row touched.

DO $$
DECLARE
  seed_purchase bigint;
  seed_sale     bigint;
BEGIN
  SELECT coalesce(
           GREATEST(
             (SELECT max(order_number) FROM exchange.purchase_orders),
             (SELECT max(number)       FROM orders.orders WHERE direction = 'purchase'),
             (SELECT last_value        FROM exchange.purchase_orders_order_number_seq)
           ), 0) + 1
    INTO seed_purchase;

  SELECT coalesce(
           GREATEST(
             (SELECT max(order_number) FROM exchange.sales_orders),
             (SELECT max(number)       FROM orders.orders WHERE direction = 'sale'),
             (SELECT last_value        FROM exchange.sales_orders_order_number_seq)
           ), 0) + 1
    INTO seed_sale;

  -- is_called = false means "the next nextval returns exactly this".
  IF seed_purchase > (SELECT last_value FROM orders.purchase_number_seq) THEN
    PERFORM setval('orders.purchase_number_seq', seed_purchase, false);
    RAISE NOTICE 'orders.purchase_number_seq re-seeded to %', seed_purchase;
  ELSE
    RAISE NOTICE 'orders.purchase_number_seq already at or beyond % - left alone', seed_purchase;
  END IF;

  IF seed_sale > (SELECT last_value FROM orders.sale_number_seq) THEN
    PERFORM setval('orders.sale_number_seq', seed_sale, false);
    RAISE NOTICE 'orders.sale_number_seq re-seeded to %', seed_sale;
  ELSE
    RAISE NOTICE 'orders.sale_number_seq already at or beyond % - left alone', seed_sale;
  END IF;
END $$;
