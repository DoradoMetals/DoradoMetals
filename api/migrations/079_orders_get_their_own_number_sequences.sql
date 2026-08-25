-- The new schema has no order-number sequence, and promotion needs one.
--
-- `orders.orders.number` has UNIQUE (direction, number) and NO default. The
-- sequences live in exchange - purchase_orders_order_number_seq and
-- sales_orders_order_number_seq - and the January refactor never gave the new
-- schema its own. features/orders/create.js draws from exchange's on every
-- order and says, in a comment, that this has to change at promotion.
--
-- It is written now rather than then because a migration nobody has written is
-- a step nobody has thought about, and this one has a subtlety worth thinking
-- about before the night it is needed.
--
-- WHY SEEDING NOW IS SAFE, WHICH create.js DOUBTED. That comment said seeding
-- now "would fix a starting point that keeps moving" - true of a hardcoded
-- number, and the reason this computes its seed in a DO block at APPLY time
-- instead. Written today, applied whenever; it reads the data as it is then.
--
-- WHAT IT SEEDS FROM, AND WHY IT IS THREE THINGS RATHER THAN ONE.
--
-- The obvious seed is max(number) from orders.orders. It is wrong. Production,
-- read-only, today:
--
--   exchange.purchase_orders   62 rows, highest 340
--   orders.orders  purchase    50 rows, highest 305
--   exchange.sales_orders      10 rows, highest  63
--   orders.orders  sale        10 rows, highest  63
--
-- The new schema is twelve purchase orders short, so its highest is 305 while
-- exchange has handed out up to 340. Seeding from orders.orders alone would
-- start the next order at 306 and collide with real orders exchange already
-- numbered - during `dual`, when both schemas hold the same order.
--
-- The third source is the exchange sequence's own last_value, which can be
-- AHEAD of both maxima. nextval is non-transactional: a number drawn by an
-- order whose transaction then rolled back is gone, and the sequence keeps it.
-- Seeding below that would re-issue a number that may yet appear in a log, an
-- email or a customer's PDF.
--
-- So: GREATEST of all three, plus one.
--
-- DEV DEMONSTRATES THE THIRD SOURCE BETTER THAN THE ARGUMENT DOES. When this
-- was applied there, exchange.purchase_orders had a highest order_number of
-- 242 and orders.orders agreed - but the exchange sequence stood at 2276,
-- because every test run that places an order draws a number and rolls back,
-- and a sequence does not give the number back. Seeding from the maxima alone
-- would have started at 243 while exchange went on to hand out 2277. The seed
-- landed on 2277.
--
-- ONLY EVER FORWARD. setval to a lower value would hand out numbers that are
-- already taken, so the DO block moves a sequence only when the computed seed
-- is higher than where it already sits. That is what makes this re-runnable -
-- verify:backfill applies every migration twice and compares - without a second
-- application undoing a live counter.
--
-- NOT DESTRUCTIVE, and lint:migrations should agree: CREATE SEQUENCE IF NOT
-- EXISTS adds, setval writes no row and touches no table, and nothing here
-- reads or alters exchange beyond SELECTing two maxima and a last_value.
--
-- THE SEQUENCES ARE NOT ATTACHED AS COLUMN DEFAULTS, deliberately. One table
-- holds both directions and each has its own series, so which sequence to draw
-- from is a function of the row - the caller picks, exactly as create.js picks
-- today. A DEFAULT could only name one of them.
--
-- GENESIS DOES NOT CREATE THESE, AND DOES NOT NEED TO. 000_genesis_schema.sql
-- covers schemas, tables, views, enums and functions - verify:genesis compares
-- those and passed unchanged after this was applied, because a sequence is none
-- of them. A from-nothing build is genesis THEN the migrations, so the chain
-- still produces them. The blind spot is worth naming rather than closing: a
-- missing sequence fails loudly on the first order - `relation
-- orders.purchase_number_seq does not exist` - not quietly.
--
-- APPLYING THIS CHANGES NOTHING ON ITS OWN. create.js keeps drawing from
-- exchange until ORDERS_SOURCE moves; these sit unread until the promotion
-- commit points at them. That is the intended state - the migration is ready
-- ahead of the switch rather than written under it.

CREATE SEQUENCE IF NOT EXISTS orders.purchase_number_seq AS bigint;
CREATE SEQUENCE IF NOT EXISTS orders.sale_number_seq AS bigint;

DO $$
DECLARE
  seed_purchase bigint;
  seed_sale     bigint;
BEGIN
  -- GREATEST ignores NULLs in Postgres, so an empty table or an untouched
  -- sequence simply does not raise the seed. coalesce to 0 keeps the result
  -- non-null when every source is empty.
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

  -- Forward only. is_called = false means "the next nextval returns exactly
  -- this", which is what a seed means; setval(x, true) would return x+1.
  IF seed_purchase > (SELECT last_value FROM orders.purchase_number_seq) THEN
    PERFORM setval('orders.purchase_number_seq', seed_purchase, false);
    RAISE NOTICE 'orders.purchase_number_seq seeded to %', seed_purchase;
  ELSE
    RAISE NOTICE 'orders.purchase_number_seq already at or beyond % - left alone', seed_purchase;
  END IF;

  IF seed_sale > (SELECT last_value FROM orders.sale_number_seq) THEN
    PERFORM setval('orders.sale_number_seq', seed_sale, false);
    RAISE NOTICE 'orders.sale_number_seq seeded to %', seed_sale;
  ELSE
    RAISE NOTICE 'orders.sale_number_seq already at or beyond % - left alone', seed_sale;
  END IF;
END $$;
