-- RULING 87 (Jacob, 2026-09-07), the schema half of finding 8.
--
-- The review found the two halves of sales tax disagreeing inside one request:
-- `db/pricing/sql/sale_quote.sql` CHARGED tax wherever a tax.sales_tax_rules
-- row matched, while `db/sales-tax/sql/accrue.sql` recorded the money as owed
-- only `WHERE reached_nexus = true`. Every tax.sales_tax row on both databases
-- has reached_nexus = false, so every dollar collected was recorded as owed to
-- nobody.
--
-- The ruling: COLLECT only where nexus is reached, and RECORD SALES VOLUME
-- EVERYWHERE, so the day a state's threshold is crossed is visible in the
-- table rather than discovered by an auditor. Economic nexus is measured on
-- sales into the state - a dollar figure, a transaction count, or both,
-- depending on the state - so both are counted.
--
-- ADDITIVE ONLY. Two columns with defaults; no row is rewritten, nothing is
-- dropped, and exchange is neither read nor written. The columns start at zero
-- because the sales that came before this migration were never counted, and
-- inventing a figure for them would be worse than an honest zero: the running
-- total starts today and the table says so.

ALTER TABLE tax.sales_tax
  ADD COLUMN IF NOT EXISTS sales_volume numeric(16,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS sales_count integer DEFAULT 0 NOT NULL;
