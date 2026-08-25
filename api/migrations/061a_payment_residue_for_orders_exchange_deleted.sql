-- 062 cannot delete an order that a payment intent still points at.
--
-- FOUND BY REHEARSING AGAINST A RESTORED COPY OF PRODUCTION. 062 failed with:
--
--   update or delete on table "orders" violates foreign key constraint
--   "intents_order_fk" on table "intents"
--
-- 062 removes new-schema rows exchange has no counterpart for, children before
-- parents, and its comment names the three: purchase orders 298, 299 and 303,
-- cancelled and deleted from exchange after the January refactor copied them.
-- What it did not account for is that January also built payments.intents, and
-- those rows reference the same three orders. On dev there is nothing to
-- reference. On production there is.
--
-- WHAT THESE ROWS ARE. Three intents, one attempt and one settlement each:
--
--   provider        deluxe
--   provider_ref    migrated;payout;order=<uuid>
--   attempt amount  0
--   settled amount  0
--   status          SUCCEEDED
--
-- The provider_ref says `migrated`. They were synthesised by the January
-- migration from exchange.payouts rows that no longer exist - not records of
-- money moving. Nothing was charged and nothing was paid out. Checked before
-- writing this, and confirmed with Jacob, because a DELETE against a payments
-- table is not something to infer your way into.
--
-- DATA-DRIVEN, NOT HARDCODED. It deletes what has no counterpart in exchange
-- rather than the three numbers that happen to be residue today, so it is
-- correct on any database and a no-op on one that has none - dev, and any
-- future rebuild where exchange never lost those orders.
--
-- CHILDREN BEFORE PARENTS: settlements, then attempts, then intents. Same
-- ordering discipline as 062, and for the same reason - not relying on a
-- cascade rule being what we assume.
--
-- Destructive only to the new schemas, which are derived and have never been
-- promoted. PAYMENTS_SOURCE has never moved off exchange, so nothing reads
-- these. exchange itself is only read.

DELETE FROM payments.settlements s
USING payments.attempts a, payments.intents i, orders.orders o
WHERE s.attempt_id = a.id
  AND a.intent_id  = i.id
  AND i.order_id   = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    x WHERE x.id = o.id);

DELETE FROM payments.attempts a
USING payments.intents i, orders.orders o
WHERE a.intent_id = i.id
  AND i.order_id  = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    x WHERE x.id = o.id);

DELETE FROM payments.intents i
USING orders.orders o
WHERE i.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    x WHERE x.id = o.id);
