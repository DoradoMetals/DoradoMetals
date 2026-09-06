-- "On duty" has no dedicated column (no migration was written for this pass -
-- see the presence tradeoff in the lane report); enabled is the closest
-- existing fact and stands in for it here.
SELECT e.id, u.email
  FROM auth.employees e
  JOIN auth.users u ON u.id = e.user_id
 WHERE e.enabled
   AND u.email IS NOT NULL
