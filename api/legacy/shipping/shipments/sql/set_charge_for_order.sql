-- The exchange half: net_charge is what `cost` is called here.
--
-- BOTH order columns, deliberately. exchange keys a shipment by
-- purchase_order_id OR sales_order_id and the caller holds one order id
-- without knowing which; the new schema has a single order_id, so matching
-- both is what makes the two halves write the same rows. For a purchase order
-- this selects exactly what `WHERE purchase_order_id = $2` selected, because
-- no sales order carries a purchase order's id.
UPDATE exchange.shipments
   SET net_charge = $1
 WHERE purchase_order_id = $2
    OR sales_order_id = $2
RETURNING id
