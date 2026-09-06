INSERT INTO payments.transfer_events
       (transfer_id, provider, event_id, event_type, provider_ref, reported_state,
        failure_reason, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6::payments.transfer_state, $7, COALESCE($8::timestamptz, now()))
ON CONFLICT (provider, event_id) DO NOTHING
RETURNING *
