INSERT INTO payments.bank_links
       (user_id, provider, moov_account_id, moov_bank_account_id, payment_method_id,
        rail, holder_name, bank_name, last_four, status, linked_by)
VALUES ($1, $2, $3, $4, $5, $6::payments.rail, $7, $8, $9,
        $10::payments.link_status, $11::payments.link_method)
RETURNING *
