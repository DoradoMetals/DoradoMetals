INSERT INTO auth.pending_changes
       (user_id, factor, next_value, verified_via, sent_to, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, user_id, factor, next_value, verified_via, sent_to, expires_at,
          confirmed_at, created_at, updated_at, created_by_id, updated_by_id
