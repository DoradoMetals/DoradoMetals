-- The money on several orders at once.
SELECT id, order_id, total, items, shipping, surcharge, sales_tax, funds,
       base_total, post_charges_amount, subject_to_charges_amount, used_funds,
       waive_shipping_fee, waive_payout_fee, shipping_paid, shipping_fee_actual,
       refiner_fee, payout_fee, pool_remediation, pool_oz_deducted,
       shipping_service, created_by, updated_by, created_at, updated_at
  FROM orders.transactions
 WHERE order_id = ANY($1::uuid[])
