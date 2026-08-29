-- Mirror of sql/accrue.sql against the schema still serving as record of truth.
UPDATE exchange.state_sales_tax
   SET amount_owed = amount_owed + $1
 WHERE state = $2
   AND reached_nexus = true
