-- Add to what a state is owed.
--
-- SCOPED TO reached_nexus, exactly as the implementation this replaces was: a
-- state below its threshold accrues nothing. The UPDATE matching no row is the
-- correct outcome there, not an error.
UPDATE tax.sales_tax
   SET amount_owed = amount_owed + $1
 WHERE state = $2
   AND reached_nexus = true
