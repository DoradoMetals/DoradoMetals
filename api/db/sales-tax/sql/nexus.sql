-- Whether a state has reached its economic nexus threshold. One row per state, enforced by a unique index on (state).
SELECT reached_nexus
  FROM tax.sales_tax
 WHERE state = $1
