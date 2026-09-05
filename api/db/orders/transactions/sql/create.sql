INSERT INTO orders.transactions
       (order_id, total, shipping, shipping_service, funds,
        post_charges_amount, subject_to_charges_amount, used_funds,
        items, base_total, surcharge, sales_tax, payout_fee, payout_details_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id
