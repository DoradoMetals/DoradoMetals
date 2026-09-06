-- The Driver and With selects. An employee id with no name is not a choice an
-- operator can make, so the name comes off auth.users in the same read.
SELECT e.id, e.user_id, e.role, e.enabled, u.name
  FROM auth.employees e
  JOIN auth.users u ON u.id = e.user_id
 WHERE e.enabled
 ORDER BY u.name ASC, e.id ASC
