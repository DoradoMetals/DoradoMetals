-- What we bid for one metal on one order.
--
-- ONE STATEMENT FOR TWO EXCHANGE FUNCTIONS. updateOrderMetals and updateSpot
-- were character-for-character the same UPDATE - the first looped over a list
-- of spots, the second took one - so the difference was never in the SQL and
-- does not need two files. The loop belongs in the caller.
--
-- exchange keyed the metal by NAME (`type`); here it is a foreign key, so the
-- caller resolves the name once rather than per row.
UPDATE orders.spots
   SET bid = $1, updated_at = now()
 WHERE order_id = $2
   AND metal_id = $3
RETURNING id, order_id, metal_id, ask, bid
