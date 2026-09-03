-- THE INTENT A CUSTOMER IS CHECKING OUT WITH, resolved from the customer
-- rather than from an id the browser sends.
--
-- It answers the same facts as find_facts_by_ref.sql - see that file for why
-- the amount is in cents and why one order_id becomes two - and it is keyed
-- the way order placement actually asks the question now (D214 item 11): "what
-- is this customer paying with?", not "is the id in this request body real?".
--
-- AN UNATTACHED INTENT WINS. `ORDER BY (i.order_id IS NULL) DESC` puts the
-- free one first, so a customer whose previous order settled and kept its
-- intent still gets the new one; the attached row is only offered back when
-- there is nothing else, which is what lets the caller tell "already paid for
-- something" (conflict) from "an abandoned checkout still holds it"
-- (supersede). A cancelled intent is never offered.
--
-- NO `type` FILTER. `payments.intents.type` is whatever the client asked for
-- (`?type=`), not a closed vocabulary this side owns - an admin opening an
-- intent for a customer writes 'admin' and names that customer as its user,
-- and it is still the intent that customer is paying with.
SELECT a.provider_ref AS payment_intent_id,
       i.id AS intent_id,
       a.id AS attempt_id,
       i.user_id,
       i.session_id,
       i.type,
       i.status AS payment_status,
       round(i.amount_expected * 100) AS amount,
       CASE WHEN o.direction = 'sale' THEN i.order_id END AS sales_order_id,
       CASE WHEN o.direction = 'purchase' THEN i.order_id END AS purchase_order_id
  FROM payments.intents i
  JOIN payments.attempts a ON a.intent_id = i.id
  LEFT JOIN orders.orders o ON o.id = i.order_id
 WHERE i.user_id = $1
   AND i.status <> 'canceled'
 ORDER BY (i.order_id IS NULL) DESC, i.created_at DESC, i.id
 LIMIT 1
