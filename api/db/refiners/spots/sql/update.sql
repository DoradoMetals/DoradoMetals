-- What the refiner bid for one metal on one order.
--
-- ONE STATEMENT FOR TWO EXCHANGE FUNCTIONS, exactly as in orders/spots:
-- updateRefinerMetals looped over a list and updateRefinerSpot took one, but
-- the UPDATE was character-for-character the same. The loop is the caller's.
--
-- exchange keyed the metal by NAME (`type`) and carried a column for each kind
-- of order; here the metal is a foreign key and there is one order id. Both
-- directions use this table - dev holds 64 purchase and 60 sales rows.
UPDATE refiners.spots
   SET bid = $1, updated_at = now()
 WHERE order_id = $2
   AND metal_id = $3
