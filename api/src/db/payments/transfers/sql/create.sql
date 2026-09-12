INSERT INTO payments.transfers
       (order_id, kind, rail, state, amount, counterparty_user_id, details_id,
        bank_link_id, provider, provider_ref, reference, idempotency_key, override_reason)
VALUES ($1, $2::payments.transfer_kind, $3::payments.rail, $4::payments.transfer_state,
        $5, $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT (order_id, kind) WHERE state <> 'Failed' AND override_reason IS NULL
DO UPDATE SET rail = EXCLUDED.rail,
              amount = EXCLUDED.amount,
              details_id = EXCLUDED.details_id,
              bank_link_id = EXCLUDED.bank_link_id,
              reference = COALESCE(EXCLUDED.reference, payments.transfers.reference)
        WHERE payments.transfers.state IN ('Not sent', 'Due')
RETURNING *
