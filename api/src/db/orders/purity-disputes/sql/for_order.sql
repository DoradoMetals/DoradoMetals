-- An order's purity disputes, newest first. Opened at/by are the audit stamp
-- (created_at, created_by_id; ruling 127).
SELECT d.id, d.order_id, d.lot_id, d.our_purity, d.claimed_purity, d.claim_source, d.reason,
       d.resolution, d.resolved_at, d.resolved_by_id, d.created_at, d.updated_at,
       d.created_by_id, d.updated_by_id
  FROM orders.purity_disputes d
 WHERE d.order_id = $1
 ORDER BY d.created_at DESC, d.id DESC
