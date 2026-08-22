-- orders.items.quantity must allow null, because exchange does and four rows use it.
--
-- exchange.purchase_order_items.quantity is nullable and null on four rows.
-- orders.items declared it NOT NULL DEFAULT 1, so the backfill had to coalesce,
-- and the order read then returned 1 where the API has always returned null.
--
-- That is a change to what the API returns, which the standing rule forbids
-- during a schema migration - and it is the mirror of the rule about not adding
-- NOT NULL from dev row counts. The January constraint is an opinion about what
-- a line item should look like; four real rows disagree with it. The opinion
-- may well be right, but tightening a column is a separate, deliberate change,
-- not something a migration does on the way past.
--
-- The default stays. A new line with no quantity still gets 1; only rows that
-- explicitly carry null keep it.
--
-- exchange is untouched.

ALTER TABLE orders.items ALTER COLUMN quantity DROP NOT NULL;
