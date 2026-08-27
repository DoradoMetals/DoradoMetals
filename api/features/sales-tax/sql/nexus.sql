-- Whether a state has reached its economic nexus threshold.
--
-- One row per state; the unique index on (state) added in migration 081 is what
-- makes that true and what this seeks on.
SELECT reached_nexus
  FROM tax.sales_tax
 WHERE state = $1
