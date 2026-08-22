-- One offer, one transaction and one address per order.
--
-- All three already hold exactly that - 16 offers across 16 orders, 31
-- transactions across 31, 20 addresses across 20 - and all three are read as
-- though it were guaranteed: the order reads LEFT JOIN each of them and would
-- silently duplicate the order row if a second ever appeared.
--
-- It also makes the dual-write possible. The mirror re-derives these rows from
-- exchange after every write, which wants ON CONFLICT, and ON CONFLICT wants a
-- unique index to conflict on. Without it the mirror would have to read first
-- and branch, which is slower and races.
--
-- Enforcing an invariant the data already satisfies, so nothing is invalidated.
-- exchange is untouched.

CREATE UNIQUE INDEX IF NOT EXISTS offers_one_per_order
  ON orders.offers (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_per_order
  ON orders.transactions (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_per_order
  ON orders.addresses (order_id);
