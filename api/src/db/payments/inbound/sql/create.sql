INSERT INTO payments.inbound_transactions
       (source, external_id, amount, occurred_at, counterparty_name, memo, account_ref)
VALUES ($1::payments.inbound_source, $2, $3, $4::timestamptz, $5, $6, $7)
ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
DO UPDATE SET amount = EXCLUDED.amount,
              occurred_at = EXCLUDED.occurred_at,
              counterparty_name = EXCLUDED.counterparty_name,
              memo = EXCLUDED.memo
        WHERE payments.inbound_transactions.state = 'Unmatched'
RETURNING *
