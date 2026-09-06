-- RULING 87. Two facts, one statement, so they can never disagree.
--
-- VOLUME is recorded for EVERY state a sale is delivered to, because economic
-- nexus is measured on sales into the state and a threshold nobody counts
-- towards is a threshold crossed without anybody noticing.
--
-- MONEY IS OWED only where nexus is already reached, which is the same
-- condition `db/pricing/sql/sale_quote.sql` collects on. Tax that was not
-- charged cannot be owed.
UPDATE tax.sales_tax
   SET amount_owed = amount_owed + CASE WHEN reached_nexus THEN $1::numeric ELSE 0::numeric END,
       sales_volume = sales_volume + $2::numeric,
       sales_count = sales_count + 1
 WHERE state = $3
RETURNING state
