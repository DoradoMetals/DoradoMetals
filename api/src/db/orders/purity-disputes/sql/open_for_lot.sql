SELECT d.id, d.order_id, d.lot_id, d.our_purity, d.claimed_purity, d.claim_source, d.reason,
       d.resolution, d.resolved_at, d.resolved_by_id, d.created_at, d.updated_at,
       d.created_by_id, d.updated_by_id
  FROM orders.purity_disputes d
 WHERE d.lot_id = $1 AND d.resolved_at IS NULL
