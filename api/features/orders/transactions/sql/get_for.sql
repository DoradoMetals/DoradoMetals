-- The money on one order.
--
-- NOT payments.ledger - that is the customer's credit balance and lives in
-- features/transactions. This is what one order came to: its totals, its fees
-- and which of them were waived. Two different things that share a word.
--
-- payout_details_id rides next to payout_fee because it names the ACCOUNT that
-- fee was charged for (099). It was added to the table and not to this list,
-- and validate:wire caught it as `expected string, received undefined` on 55 of
-- 63 orders - the generated contract declares the column `.nullable()`, and a
-- nullable field still requires the KEY to be present. A row that omits it is
-- not a row with a null; it is a different shape. Rows go on the wire verbatim
-- (rulings 9 + 12), so the projection follows the table.
SELECT id, order_id, total, items, shipping, surcharge, sales_tax, funds,
       base_total, post_charges_amount, subject_to_charges_amount, used_funds,
       waive_shipping_fee, waive_payout_fee, shipping_paid, shipping_fee_actual,
       refiner_fee, payout_fee, payout_details_id, pool_remediation, pool_oz_deducted,
       shipping_service, created_by, updated_by, created_at, updated_at,
       created_by_id, updated_by_id
  FROM orders.transactions
 WHERE order_id = $1
