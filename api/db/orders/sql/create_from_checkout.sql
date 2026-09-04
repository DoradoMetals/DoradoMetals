-- AN ORDER, COPIED FROM THE CHECKOUT IT BECAME (ruling 66, Jacob: "I also hate
-- all those returns"). The owner and the direction are the checkout row's, so
-- no function assembles a row literal from them first - the statement copies.
--
-- THE NUMBER IS NATIVE SINCE D213. This drew from exchange's per-direction
-- sequence, which made every order create a WRITE to exchange - nextval
-- mutates - long after the purge was supposed to have ended them. 079 built
-- orders.purchase_number_seq and orders.sale_number_seq for this moment and
-- 115 re-seeded them to clear the numbers already issued.
--
-- NO AUTHOR COLUMNS: public.audit_stamp writes them from the actor on the
-- connection (migration 116). An explicit id wins; NULL generates one.
INSERT INTO orders.orders (id, user_id, direction, status, number)
SELECT COALESCE($1, gen_random_uuid()), c.user_id,
       c.direction::orders.direction, $2,
       nextval(CASE c.direction WHEN 'purchase'
               THEN 'orders.purchase_number_seq'
               ELSE 'orders.sale_number_seq' END)
  FROM checkout.checkouts c
 WHERE c.id = $3
RETURNING *
