-- The asked leads ($1 uuid[]) in order of their estimated value, $2 asc or
-- desc, as one uuid[]. The totals are lead_estimate_totals.sql's, substituted
-- below, so the ranking and the column a screen shows are one figure. A lead
-- with no estimate item sorts last either way; ties fall back to the id.
WITH totals AS (
  /*__lead_estimate_totals__*/
)
SELECT coalesce(
         array_agg(t.lead_id ORDER BY
           EXISTS (SELECT 1 FROM leads.estimate_items i WHERE i.lead_id = t.lead_id) DESC,
           CASE WHEN $2 = 'asc' THEN t.total END ASC,
           CASE WHEN $2 = 'desc' THEN t.total END DESC,
           t.lead_id ASC),
         '{}'::uuid[]) AS lead_ids
  FROM totals t
