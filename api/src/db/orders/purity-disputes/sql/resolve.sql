-- Resolving stamps when and by whom beside the outcome. resolved_by_id is the
-- transaction's actor (app.actor_id, set by withTransaction), kept only when
-- it names a user, as public.audit_stamp() does. An already-resolved dispute
-- is not touched: the WHERE makes the write a no-op the caller can see.
UPDATE orders.purity_disputes
   SET resolution = $2,
       resolved_at = now(),
       resolved_by_id = (SELECT u.id FROM auth.users u
                          WHERE u.id::text = nullif(current_setting('app.actor_id', true), ''))
 WHERE id = $1 AND resolved_at IS NULL
RETURNING id, order_id, lot_id, our_purity, claimed_purity, claim_source, reason,
          resolution, resolved_at, resolved_by_id, created_at, updated_at,
          created_by_id, updated_by_id
