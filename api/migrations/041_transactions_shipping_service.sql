-- sales_orders.shipping_service, the last orders column with no home.
--
-- Deferred by 033 because shipping.shipments already has service_type and
-- deciding whether they are the same field belongs with the shipping migration.
-- That reasoning still holds, but the sales order read returns the column and
-- the standing rule is that a migration never changes the wire shape, so it
-- needs somewhere to live now.
--
-- It goes next to the shipping cost. In exchange the pair sits together -
-- shipping_service and shipping_cost - and shipping_cost is already
-- transactions.shipping, so keeping them together is the change that assumes
-- least. It is the service the customer was charged for, which is a fact about
-- what was billed whether or not it turns out to duplicate the shipment's.
--
-- If the shipping migration later concludes the two are one field, this column
-- is the one to drop, and dropping a column that duplicates another is a much
-- easier conversation than recovering one that was never carried across.
--
-- Additive and nullable; 042 fills it. exchange is untouched.

ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS shipping_service text;
