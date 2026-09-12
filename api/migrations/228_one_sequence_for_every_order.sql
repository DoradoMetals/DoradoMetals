-- FOUR PREFIXES, ONE NUMBER SPACE.
--
-- PO- (customer purchase), SO- (customer sale), RP- (refiner purchase, we
-- buy) and RS- (refiner sale, we sell) draw from one shared sequence going
-- forward, so a bare number is unique across all four without its prefix.
-- Customer orders keep the numbers already on their documents. A refiner
-- order keeps its numeric part too, UNLESS that number already names an
-- existing customer order - the two had independent sequences until now, so
-- a collision was possible even though none happened to exist here; a
-- colliding refiner order draws a fresh number instead.
--
-- Re-running is a no-op: the seed only moves the sequence forward, and a
-- refiner order fixed once no longer collides with anything the second time
-- the collision scan runs.
--
-- `exchange` is neither read nor written.

CREATE SEQUENCE IF NOT EXISTS orders.number_seq AS bigint;

DO $$
DECLARE
  seed bigint;
BEGIN
  SELECT GREATEST(
           COALESCE((SELECT max(number) FROM orders.orders), 0),
           COALESCE((SELECT max(number) FROM refining.orders), 0),
           COALESCE((SELECT last_value FROM orders.purchase_number_seq), 0),
           COALESCE((SELECT last_value FROM orders.sale_number_seq), 0),
           COALESCE((SELECT last_value FROM refining.order_number_seq), 0)
         ) + 1
    INTO seed;

  IF seed > (SELECT last_value FROM orders.number_seq) THEN
    PERFORM setval('orders.number_seq', seed, false);
    RAISE NOTICE 'orders.number_seq seeded to %', seed;
  ELSE
    RAISE NOTICE 'orders.number_seq already at or beyond % - left alone', seed;
  END IF;
END $$;

ALTER TABLE refining.orders ALTER COLUMN number SET DEFAULT nextval('orders.number_seq'::regclass);

DO $$
DECLARE
  r RECORD;
  fresh bigint;
  collisions int := 0;
BEGIN
  FOR r IN
    SELECT ro.id, ro.number FROM refining.orders ro
     WHERE EXISTS (SELECT 1 FROM orders.orders oo WHERE oo.number = ro.number)
  LOOP
    fresh := nextval('orders.number_seq');
    UPDATE refining.orders SET number = fresh WHERE id = r.id;
    collisions := collisions + 1;
    RAISE NOTICE 'refiner order % renumbered % -> % (collided with a customer order)',
      r.id, r.number, fresh;
  END LOOP;
  RAISE NOTICE 'refiner orders relabelled: % of % renumbered for a customer-number collision',
    collisions, (SELECT count(*) FROM refining.orders);
END $$;
