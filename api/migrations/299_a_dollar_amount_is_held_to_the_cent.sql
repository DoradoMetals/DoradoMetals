-- A DOLLAR AMOUNT IS HELD TO THE CENT.
--
-- The legacy purchase totals carry float residue (7085.990000000001 is the
-- `exchange` value itself, in 52 of 62 staging rows) and the backfills copy it
-- faithfully. A payout of 7085.99 then never reaches that total, and the order
-- reads Ready to Pay beside a Sent payout. This pass rounds every dollar column
-- in the new schema to two places, only where it holds more than that.
--
-- Dollars only: spot prices, weights, premiums and percentages are not touched.
-- payments.transfers.amount, payments.refunds.amount and shipping.claims
-- amount / paid_amount are numeric(16,2) already and are not listed.
--
-- IDEMPOTENT: each statement matches only a value that differs from its own
-- rounding, so a second run matches nothing. The statements read and write the
-- new schemas; `exchange` is neither read nor written. The audit_stamp trigger
-- stamps updated_at on the rows it changes, as it does for any correction.

UPDATE orders.transactions
   SET total = round(total, 2),
       base_total = round(base_total, 2),
       items = round(items, 2),
       shipping = round(shipping, 2),
       surcharge = round(surcharge, 2),
       sales_tax = round(sales_tax, 2),
       funds = round(funds, 2),
       refiner_fee = round(refiner_fee, 2),
       shipping_fee_actual = round(shipping_fee_actual, 2),
       payout_fee = round(payout_fee, 2),
       post_charges_amount = round(post_charges_amount, 2),
       subject_to_charges_amount = round(subject_to_charges_amount, 2)
 WHERE total <> round(total, 2)
    OR base_total <> round(base_total, 2)
    OR items <> round(items, 2)
    OR shipping <> round(shipping, 2)
    OR surcharge <> round(surcharge, 2)
    OR sales_tax <> round(sales_tax, 2)
    OR funds <> round(funds, 2)
    OR refiner_fee <> round(refiner_fee, 2)
    OR shipping_fee_actual <> round(shipping_fee_actual, 2)
    OR payout_fee <> round(payout_fee, 2)
    OR post_charges_amount <> round(post_charges_amount, 2)
    OR subject_to_charges_amount <> round(subject_to_charges_amount, 2);

UPDATE payments.ledger SET amount = round(amount, 2) WHERE amount <> round(amount, 2);

UPDATE payments.settlements
   SET settled_amount = round(settled_amount, 2)
 WHERE settled_amount <> round(settled_amount, 2);
