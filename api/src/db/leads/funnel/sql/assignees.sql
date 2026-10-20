-- The Assign picker's rows: every enabled employee with the number of open
-- leads (not converted, not archived) assigned to them now.
SELECT e.id, e.user_id, e.role, e.enabled, u.name,
       (SELECT count(*)::int
          FROM leads.leads l
         WHERE l.assigned_to_id = e.user_id
           AND l.converted_at IS NULL
           AND l.archived_at IS NULL) AS open
  FROM auth.employees e
  JOIN auth.users u ON u.id = e.user_id
 WHERE e.enabled
 ORDER BY u.name ASC, e.id ASC
