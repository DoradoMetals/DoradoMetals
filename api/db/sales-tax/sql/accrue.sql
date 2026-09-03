-- Add to what a state is owed. Scoped to reached_nexus — a state below its
-- threshold matches no row, which is the correct outcome, not an error.
UPDATE tax.sales_tax
   SET amount_owed = amount_owed + $1
 WHERE state = $2
   AND reached_nexus = true
