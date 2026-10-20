-- The ids of every lead the list filters match ($1..$8, filter.sql), for the
-- pricing domain to rank by estimated value.
SELECT coalesce(array_agg(id), '{}'::uuid[]) AS ids
  FROM leads.leads
 WHERE /*__lead_filter__*/
