-- Cancel a sales order whose payment never arrived - and ONLY from Pending,
-- the same write-safety guard as mark_sale_paid.sql: the reconciler retries,
-- admins move labels, and a sweep must never stomp either. The trigger is a
-- payment fact (the attached intent was never confirmed inside the TTL); the
-- predicate only keeps retries and races honest.
UPDATE orders.orders
   SET status = 'Cancelled', updated_by = $2, updated_at = now()
 WHERE id = $1
   AND direction = 'sale'
   AND status = 'Pending'
RETURNING id
