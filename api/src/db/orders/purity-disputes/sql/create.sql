INSERT INTO orders.purity_disputes (order_id, lot_id, our_purity, claimed_purity, claim_source, reason)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, order_id, lot_id, our_purity, claimed_purity, claim_source, reason,
          resolution, resolved_at, resolved_by_id, created_at, updated_at,
          created_by_id, updated_by_id
