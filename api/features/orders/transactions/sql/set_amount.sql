-- One of the four money columns an admin can adjust on a purchase order.
--
-- FOUR NEAR-IDENTICAL EXCHANGE FUNCTIONS, ONE STATEMENT. updateShippingActual,
-- updateRefinerFee, updatePoolOzDeducted and updatePoolRemediation differed
-- only in the column name, so they are one call with a closed set of four - the
-- same technique as orders/sql/set_flag.sql, and safe for the same reason:
-- repo.ts maps a fixed set of literals onto the substitution and nothing
-- derived from a request can reach it.
UPDATE orders.transactions
   SET __COLUMN__ = $1,
       updated_by = coalesce($2, updated_by),
       updated_at = now()
 WHERE order_id = $3
RETURNING id, order_id, __COLUMN__ AS value
