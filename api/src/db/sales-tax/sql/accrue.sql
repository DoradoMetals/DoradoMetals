UPDATE tax.sales_tax
   SET amount_owed = amount_owed + $1
 WHERE state = $2
   AND reached_nexus = true
