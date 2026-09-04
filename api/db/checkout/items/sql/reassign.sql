-- The visitor's basket lines move onto the customer's surviving checkout row.
-- The caller has emptied the destination first: the visitor's basket is the one
-- the customer is looking at, so it REPLACES rather than merges (see
-- domain/checkout/rules.ts's merge rule).
UPDATE checkout.items
   SET checkout_id = $2
 WHERE checkout_id = $1
