-- Advance a sales order to Preparing when its payment settles - and ONLY from
-- Pending, which is what separates this from set_status.sql.
--
-- Called by the payment_intent.succeeded webhook and by reconcile:payments,
-- both of which RETRY. The `status = 'Pending'` predicate is write-safety, not
-- business logic (the statuses-are-labels ruling): the TRIGGER for this write
-- is a payment fact - the intent succeeded - and the predicate exists so a
-- webhook retry cannot resurrect an order an admin has since Cancelled, or
-- stomp any later label. Zero rows here means "nothing needed doing", which the
-- caller treats as success on retry and reports when it disagrees with the
-- exchange half.
UPDATE orders.orders
   SET status = 'Preparing', updated_by = $2, updated_at = now()
 WHERE id = $1
   AND direction = 'sale'
   AND status = 'Pending'
RETURNING id
