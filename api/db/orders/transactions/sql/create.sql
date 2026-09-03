-- What the order came to, written beside it - ONE INSERT with everything known
-- at placement, the payout account and its fee included (D214 item 11: a use
-- case does not create a row and then update it in the next line).
--
-- exchange keeps these columns ON the sales order row; here they are their own
-- table, shared with purchase orders. The names differ and the mapping is
-- stated once, here:
--
--   order_total               -> total
--   shipping_cost             -> shipping
--   pre_charges_amount        -> funds
--   item_total                -> items
--   charges_amount            -> surcharge
--
-- The rest keep their names. created_by/updated_by are gone: public.audit_stamp
-- writes them from the actor on the connection (migration 116).
INSERT INTO orders.transactions
       (id, order_id, total, shipping, shipping_service, funds,
        post_charges_amount, subject_to_charges_amount, used_funds,
        items, base_total, surcharge, sales_tax, payout_fee, payout_details_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING id
